-- DISTRIBUIÇÃO v5 — o botão da liderança passa a honrar a fila de atendimento.
--
-- ── O que a v4 fazia, e por que não bastava ─────────────────────────────────
--
-- `distribute_project_leads_v4` (que chama a v3) escolhe o corretor por carga
-- ponderada e não conhece `distribution_roster`. Com a fila de atendimento
-- ligada só à entrada automática, o produto passava a ter DUAS verdades sobre
-- de quem é a vez: a lead que entra sozinha respeita a fila, e a mesma lead
-- distribuída pelo botão da liderança ignora a fila inteira. Duas portas para a
-- mesma decisão é como nasce a lead entregue a quem não devia.
--
-- ── O que muda, e o que continua igual ──────────────────────────────────────
--
-- MUDA    quando existe elenco para o escopo da lead (campanha vence projeto,
--         a mesma precedência de `lib/distribution/elenco-por-escopo.ts`), só
--         entram os do elenco, e a ordem é o RODÍZIO: a lead vai para quem vem
--         depois de quem recebeu por último naquele escopo.
-- IGUAL   sem elenco cadastrado, a escolha continua por carga ponderada, com o
--         mesmo desempate da v3. Base sem nenhuma linha em `distribution_roster`
--         se comporta exatamente como antes.
--
-- ── Três defeitos da v3 que descem junto ────────────────────────────────────
--
-- 1. ACERVO DE RESGATE ENTRAVA COMO DEMANDA NOVA. A v3 pega qualquer lead sem
--    responsável. O acervo importado tem balcão próprio (o corretor se serve em
--    /api/v1/crm/acervo) e não pode ser empurrado para a carteira de ninguém
--    como se fosse lead de hoje. A v5 exige `import_batch_id is null`, que é a
--    mesma regra que o caminho em Node já aplicava.
--
-- 2. LEAD COM DONO NO BANCO E ÓRFÃ NA TELA. A v3 grava só `assigned_to`. Metade
--    do produto lê `assigned_user_id`, e a lead distribuída aparecia sem dono
--    nessas telas. A v5 grava as duas colunas.
--
-- 3. O PONTEIRO DO RODÍZIO NÃO TINHA ONDE MORAR. A v3 registra em
--    `lead_distribution_events`; a cascata de entrada automática registra em
--    `lead_distribution_history`. Duas tabelas de auditoria para o mesmo fato, e
--    o rodízio precisa de UMA para saber quem recebeu por último. A v5 escreve
--    nas duas: `events` continua alimentando o livro "por que cada lead foi
--    atribuída" (com o snapshot de score que só ele tem), e `history` passa a
--    ser a fonte única do ponteiro, escrita por TODOS os caminhos.
--
-- ── SEGURANÇA DESTA MIGRATION ───────────────────────────────────────────────
--
-- ADITIVA: cria uma função nova. A v3 e a v4 continuam existindo, intocadas, e
-- a rota cai nelas se a v5 não existir. Rollback é `drop function ... v5`.

create or replace function public.distribute_project_leads_v5(
  p_actor_id uuid,
  p_organization_id uuid,
  p_development_id uuid,
  p_limit integer default 1,
  p_acceptance_minutes integer default 5
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  actor_role text;
  counter integer;
  selected_lead uuid; selected_source text; selected_priority integer;
  selected_sla integer; selected_wait integer; selected_campaign uuid;
  selected_broker uuid; selected_load integer; selected_weight integer;
  selected_turn timestamptz; selected_rank integer;
  escopo_do_elenco text; escopo_id_do_elenco text; membros_no_elenco integer;
  distribuidas integer := 0; changed integer;
  reservation_id uuid;
  assignments jsonb := '[]'::jsonb;
  reservations jsonb := '[]'::jsonb;
begin
  if p_limit < 1 or p_limit > 100 then raise exception 'distribution_limit_invalid'; end if;
  if p_acceptance_minutes < 2 or p_acceptance_minutes > 30 then raise exception 'reservation_period_invalid'; end if;

  select coalesce(commercial_role, case role when 'admin' then 'director' else role end)
    into actor_role
    from public.profiles
   where id = p_actor_id and organization_id = p_organization_id and active = true;
  if actor_role is null or actor_role not in ('director','superintendent','manager') then
    raise exception 'distribution_actor_forbidden';
  end if;

  if not exists (select 1 from public.developments where id = p_development_id and organization_id = p_organization_id) then
    raise exception 'distribution_project_invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || p_development_id::text, 57));

  for counter in 1..p_limit loop
    -- ── A LEAD: maior pressão de SLA, prioridade da origem, mais antiga ────
    select l.id,
           lower(trim(coalesce(l.source,'não informada'))),
           coalesce(r.priority, 5),
           coalesce(r.sla_minutes, 60),
           greatest(0, floor(extract(epoch from (now() - l.created_at)) / 60)::integer),
           l.campaign_id
      into selected_lead, selected_source, selected_priority, selected_sla, selected_wait, selected_campaign
      from public.leads l
      left join public.lead_distribution_priority_rules r
        on r.organization_id = p_organization_id
       and r.development_id = p_development_id
       and r.source_key = lower(trim(coalesce(l.source,'não informada')))
       and r.enabled = true
     where l.organization_id = p_organization_id
       and l.development_id = p_development_id
       and l.assigned_to is null
       and l.assigned_user_id is null
       -- Acervo de resgate tem balcão próprio; ver o defeito 1 no cabeçalho.
       and l.import_batch_id is null
     order by (greatest(0, floor(extract(epoch from (now() - l.created_at)) / 60))::numeric / coalesce(r.sla_minutes, 60)) desc,
              coalesce(r.priority, 5) desc,
              l.created_at,
              l.id
       for update of l skip locked
     limit 1;
    exit when selected_lead is null;

    -- ── O ELENCO DESTA LEAD: campanha vence projeto ───────────────────────
    --
    -- Mesma precedência da regra pura, e pelo mesmo motivo: a campanha é a
    -- decisão mais recente e mais específica. Elenco existe apenas quando tem
    -- pelo menos um membro ATIVO — zero membros significa "fila aberta a toda a
    -- equipe", nunca "ninguém recebe".
    escopo_do_elenco := null;
    escopo_id_do_elenco := null;
    if selected_campaign is not null then
      select count(*) into membros_no_elenco
        from public.distribution_roster
       where organization_id = p_organization_id and escopo = 'campanha'
         and escopo_id = selected_campaign::text and ativo = true;
      if membros_no_elenco > 0 then
        escopo_do_elenco := 'campanha';
        escopo_id_do_elenco := selected_campaign::text;
      end if;
    end if;
    if escopo_do_elenco is null then
      select count(*) into membros_no_elenco
        from public.distribution_roster
       where organization_id = p_organization_id and escopo = 'projeto'
         and escopo_id = p_development_id::text and ativo = true;
      if membros_no_elenco > 0 then
        escopo_do_elenco := 'projeto';
        escopo_id_do_elenco := p_development_id::text;
      end if;
    end if;

    -- ── O CORRETOR ────────────────────────────────────────────────────────
    with recursive descendentes as (
      select id from public.profiles
       where id = p_actor_id and organization_id = p_organization_id
      union all
      select p.id from public.profiles p
        join descendentes d on p.reports_to = d.id
       where p.organization_id = p_organization_id and p.active = true
    ),
    elegiveis as (
      select p.id,
             (select count(*) from public.leads lp
               where lp.organization_id = p_organization_id
                 and lp.assigned_to = p.id
                 and lp.development_id = p_development_id
                 and lower(coalesce(lp.status,'novo')) not in
                     ('won','ganho','vendido','lost','perdido','descartado','discarded','archived','arquivado')
             )::integer as project_load,
             coalesce(m.weight, 1) as weight,
             m.last_assigned_at
        from public.profiles p
        join public.commercial_presence cp
          on cp.profile_id = p.id
         and cp.organization_id = p_organization_id
         and cp.availability = 'available'
         and cp.last_seen_at >= now() - interval '90 seconds'
        left join public.project_distribution_members m
          on m.development_id = p_development_id and m.profile_id = p.id
        left join public.broker_capacity_limits cap
          on cap.organization_id = p_organization_id and cap.profile_id = p.id
       where p.organization_id = p_organization_id
         and p.active = true
         and coalesce(p.commercial_role, p.role) = 'broker'
         and coalesce(m.enabled, true)
         and (actor_role = 'director' or p.id in (select id from descendentes))
         and (select count(*) from public.leads lt
               where lt.organization_id = p_organization_id and lt.assigned_to = p.id
                 and lower(coalesce(lt.status,'novo')) not in
                     ('won','ganho','vendido','lost','perdido','descartado','discarded','archived','arquivado')
             ) < coalesce(cap.max_active_leads, 2147483647)
         and (select count(*) from public.leads lp
               where lp.organization_id = p_organization_id and lp.assigned_to = p.id
                 and lp.development_id = p_development_id
                 and lower(coalesce(lp.status,'novo')) not in
                     ('won','ganho','vendido','lost','perdido','descartado','discarded','archived','arquivado')
             ) < coalesce(cap.max_project_leads, 2147483647)
    ),
    -- A fila INTEIRA do escopo, não só quem pode atender agora. O ponteiro tem
    -- que ser calculado sobre todos os membros: se ele considerasse apenas os
    -- elegíveis, alguém indisponível deixaria de "gastar a vez" e a ordem
    -- mudaria conforme quem estivesse online, que é o oposto de rodízio.
    fila as (
      select rst.profile_id,
             rst.posicao,
             rst.created_at,
             (select max(h.created_at)
                from public.lead_distribution_history h
                join public.leads ls on ls.id = h.lead_id
               where h.organization_id = p_organization_id
                 and h.assigned_user_id = rst.profile_id
                 and ((escopo_do_elenco = 'campanha' and ls.campaign_id::text = escopo_id_do_elenco)
                   or (escopo_do_elenco = 'projeto'  and ls.development_id::text = escopo_id_do_elenco))
             ) as ultima_do_escopo
        from public.distribution_roster rst
       where rst.organization_id = p_organization_id
         and rst.ativo = true
         and rst.escopo = escopo_do_elenco
         and rst.escopo_id = escopo_id_do_elenco
    ),
    fila_ordenada as (
      select f.*,
             row_number() over (order by coalesce(f.posicao, 32767), f.created_at, f.profile_id) as rn,
             count(*) over () as total
        from fila f
    ),
    -- Quem recebeu por último ENTRE OS QUE ESTÃO NA FILA. Sem linha (ninguém
    -- nunca recebeu deste escopo), a vez é do primeiro da ordem.
    ancora as (
      select rn as arn from fila_ordenada
       where ultima_do_escopo is not null
       order by ultima_do_escopo desc
       limit 1
    )
    select e.id, e.project_load, e.weight, f.ultima_do_escopo, f.rn
      into selected_broker, selected_load, selected_weight, selected_turn, selected_rank
      from elegiveis e
      left join fila_ordenada f on f.profile_id = e.id
      left join ancora a on true
     -- Com elenco, só quem está nele. Sem elenco, todo elegível passa.
     where escopo_do_elenco is null or f.profile_id is not null
     order by
       -- Distância cíclica depois da âncora: 0 é a vez. Nulo quando não há
       -- elenco, e aí a coluna seguinte é que decide.
       (case when escopo_do_elenco is null then null
             else ((f.rn - coalesce(a.arn, 0) - 1 + f.total) % f.total) end) asc,
       (case when escopo_do_elenco is null then (e.project_load::numeric / e.weight) else null end) asc,
       e.last_assigned_at asc nulls first,
       e.id
     limit 1;

    if selected_broker is null then
      -- Distinguir as duas causas importa: "o time deste escopo existe e
      -- ninguém dele pode atender" pede uma ação (chamar o time, revisar a
      -- fila); "ninguém na estrutura tem capacidade" pede outra.
      if escopo_do_elenco is not null then
        raise exception 'distribution_roster_unavailable';
      end if;
      raise exception 'distribution_no_broker_with_capacity';
    end if;

    -- As DUAS colunas de dono; ver o defeito 2 no cabeçalho.
    update public.leads
       set assigned_to = selected_broker, assigned_user_id = selected_broker, updated_at = now()
     where id = selected_lead
       and organization_id = p_organization_id
       and development_id = p_development_id
       and assigned_to is null;
    get diagnostics changed = row_count;
    if changed <> 1 then raise exception 'distribution_owner_conflict'; end if;

    insert into public.project_distribution_members
      (organization_id, development_id, profile_id, assignments_count, last_assigned_at, updated_at)
    values (p_organization_id, p_development_id, selected_broker, 1, now(), now())
    on conflict (development_id, profile_id) do update
      set assignments_count = public.project_distribution_members.assignments_count + 1,
          last_assigned_at = excluded.last_assigned_at,
          updated_at = excluded.updated_at;

    insert into public.lead_distribution_events
      (organization_id, development_id, lead_id, assigned_to, actor_id, algorithm, score_snapshot)
    values (p_organization_id, p_development_id, selected_lead, selected_broker, p_actor_id,
            'roster_rotation_v5',
            jsonb_build_object(
              'algorithm', 'roster_rotation_v5',
              'source', selected_source,
              'sourcePriority', selected_priority,
              'slaMinutes', selected_sla,
              'waitingMinutes', selected_wait,
              'slaRatio', round(selected_wait::numeric / selected_sla, 4),
              'projectLoadBefore', selected_load,
              'weight', selected_weight,
              'weightedLoadBefore', round(selected_load::numeric / greatest(selected_weight, 1), 2),
              'rosterScope', escopo_do_elenco,
              'rosterScopeId', escopo_id_do_elenco,
              'queuePosition', selected_rank,
              'previousTurnAt', selected_turn,
              'personalDataUsed', false,
              'criteria', case when escopo_do_elenco is null
                then jsonb_build_array('sla_wait','project','source','capacity','online','weighted_load')
                else jsonb_build_array('sla_wait','project','source','capacity','online','roster','rotation') end));

    -- A fonte ÚNICA do ponteiro do rodízio; ver o defeito 3 no cabeçalho.
    insert into public.lead_distribution_history
      (organization_id, lead_id, assigned_user_id, reason)
    values (p_organization_id, selected_lead, selected_broker,
            case when escopo_do_elenco is null
              then 'Distribuição da liderança: carga ponderada e última atribuição.'
              else 'Distribuição da liderança: rodízio da fila de atendimento (' || escopo_do_elenco || '), ' || selected_rank || 'º da ordem.' end);

    update public.lead_assignment_reservations
       set status = 'superseded', released_at = now(),
           release_reason = 'Nova atribuição substituiu a reserva.'
     where lead_id = selected_lead and status = 'pending';

    insert into public.lead_assignment_reservations
      (organization_id, lead_id, broker_id, expires_at)
    values (p_organization_id, selected_lead, selected_broker, now() + make_interval(mins => p_acceptance_minutes))
    returning id into reservation_id;

    reservations := reservations || jsonb_build_array(jsonb_build_object(
      'reservationId', reservation_id, 'leadId', selected_lead,
      'brokerId', selected_broker, 'expiresInMinutes', p_acceptance_minutes));

    assignments := assignments || jsonb_build_array(jsonb_build_object(
      'leadId', selected_lead, 'brokerId', selected_broker, 'source', selected_source,
      'sourcePriority', selected_priority, 'slaMinutes', selected_sla, 'waitingMinutes', selected_wait,
      'rosterScope', escopo_do_elenco, 'queuePosition', selected_rank,
      'reason', case when escopo_do_elenco is null
        then 'Maior pressão de SLA; prioridade de origem; antiguidade. Corretor por capacidade e carga ponderada.'
        else 'Maior pressão de SLA; prioridade de origem; antiguidade. Corretor pela vez no rodízio da fila de atendimento.' end));

    distribuidas := distribuidas + 1;
    selected_lead := null;
    selected_broker := null;
  end loop;

  return jsonb_build_object(
    'distributed', distribuidas,
    'developmentId', p_development_id,
    'algorithm', 'roster_rotation_v5',
    'assignments', assignments,
    'reservations', reservations,
    'acceptanceMinutes', p_acceptance_minutes,
    'acceptanceRequired', true,
    'rosterHonoured', true,
    'rescueStockExcluded', true,
    'bothOwnerColumnsWritten', true,
    'personalDataUsed', false,
    'peopleRanking', false,
    'singleOwnerPreserved', true,
    'capacityEnforced', true,
    'atomic', true);
end
$function$;

comment on function public.distribute_project_leads_v5 is
  'Distribuição da liderança honrando distribution_roster: com elenco no escopo (campanha vence projeto), só o elenco entra e a ordem é o rodízio; sem elenco, carga ponderada como na v3. Exclui acervo de resgate, grava as duas colunas de dono e registra o ponteiro em lead_distribution_history.';

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
--   drop function if exists public.distribute_project_leads_v5(uuid,uuid,uuid,integer,integer);
--
-- A rota volta a chamar a v4, que continua existindo intocada. Nenhuma lead
-- deixa de ser distribuída; a fila de atendimento volta a valer só para a
-- entrada automática.
