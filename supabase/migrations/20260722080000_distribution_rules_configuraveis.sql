-- Fila de distribuição com critério editável pelo gestor.
--
-- O motor public.distribute_project_leads já existia e é bom: pega
-- pg_advisory_xact_lock por organização+projeto, usa `for update skip locked` (dois
-- gestores distribuindo ao mesmo tempo não duplicam lead) e registra cada atribuição em
-- lead_distribution_events com o retrato da carga. O que faltava era tornar as decisões
-- dele CONFIGURÁVEIS — hoje estão fixas no corpo da função:
--
--   ordem da fila      -> `order by l.created_at, l.id`         (sempre o mais antigo)
--   exigir presença    -> obrigatório
--   janela de presença -> `now() - interval '90 seconds'`       (número mágico)
--   escolha do corretor-> `(carga_do_projeto / peso)`, desempate por quem está há mais
--                          tempo sem receber
--   teto por corretor  -> não existe
--
-- REGRA QUE GOVERNA ESTA MIGRATION: os padrões reproduzem EXATAMENTE o comportamento
-- atual. Quem não configurar nada não sente diferença nenhuma — a tabela nasce vazia e
-- a função cai no mesmo caminho de antes. Evoluir sem regredir só vale se o padrão for
-- o presente, não a novidade.

create table if not exists public.distribution_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- Nulo = regra padrão da organização. Preenchido = regra específica do projeto, que
  -- tem precedência. Assim o gestor ajusta um lançamento sem mexer no resto da operação.
  development_id uuid,

  -- Ordem da fila: qual lead sai primeiro.
  queue_order text not null default 'oldest'
    check (queue_order in ('oldest', 'highest_score', 'hottest', 'sla_risk')),

  -- Exigir corretor online. Hoje é obrigatório; desligar permite distribuir fora do
  -- horário comercial, quando ninguém está com a tela aberta.
  require_presence boolean not null default true,

  -- Janela de presença em segundos. Era o literal 90 dentro da função.
  presence_window_seconds integer not null default 90
    check (presence_window_seconds between 15 and 3600),

  -- Como escolher entre os corretores elegíveis.
  broker_choice text not null default 'balanced_load'
    check (broker_choice in ('balanced_load', 'round_robin', 'fewest_total')),

  -- Teto diário por corretor. Nulo = sem teto, que é o comportamento de hoje.
  daily_cap_per_broker integer
    check (daily_cap_per_broker is null or daily_cap_per_broker between 1 and 500),

  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uma regra por escopo. O índice parcial cobre o caso do padrão da organização, onde
-- development_id é nulo e um unique comum não impediria duplicatas.
create unique index if not exists distribution_rules_org_development_uidx
  on public.distribution_rules (organization_id, development_id)
  where development_id is not null;
create unique index if not exists distribution_rules_org_default_uidx
  on public.distribution_rules (organization_id)
  where development_id is null;

alter table public.distribution_rules enable row level security;

-- Leitura para a organização inteira: o corretor tem direito de saber por que critério
-- os leads são distribuídos. Escrita é ato de liderança comercial.
drop policy if exists distribution_rules_org_select on public.distribution_rules;
create policy distribution_rules_org_select on public.distribution_rules
  for select to authenticated
  using (organization_id = (select public.current_organization_id()));

drop policy if exists distribution_rules_leadership_write on public.distribution_rules;
create policy distribution_rules_leadership_write on public.distribution_rules
  for all to authenticated
  using (organization_id = (select public.current_organization_id())
         and (select private.is_commercial_leadership()))
  with check (organization_id = (select public.current_organization_id())
              and (select private.is_commercial_leadership()));

-- Resolve a regra em vigor: a do projeto vence a da organização; sem nenhuma, devolve
-- os padrões — que são o comportamento atual.
create or replace function public.effective_distribution_rule(
  p_organization_id uuid,
  p_development_id uuid
)
returns public.distribution_rules
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  regra public.distribution_rules;
begin
  select * into regra
  from public.distribution_rules r
  where r.organization_id = p_organization_id
    and (r.development_id = p_development_id or r.development_id is null)
  -- Específica do projeto primeiro; o padrão da organização é o fallback.
  order by (r.development_id is null)
  limit 1;

  if regra.id is null then
    regra.organization_id := p_organization_id;
    regra.development_id := p_development_id;
    regra.queue_order := 'oldest';
    regra.require_presence := true;
    regra.presence_window_seconds := 90;
    regra.broker_choice := 'balanced_load';
    regra.daily_cap_per_broker := null;
  end if;

  return regra;
end;
$$;

revoke all on function public.effective_distribution_rule(uuid, uuid) from public, anon;
grant execute on function public.effective_distribution_rule(uuid, uuid) to authenticated, service_role;

-- Motor de distribuição, agora obedecendo à regra. A assinatura é idêntica à anterior
-- de propósito: nenhuma rota da aplicação precisa mudar para ganhar a configuração.
create or replace function public.distribute_project_leads(
  p_actor_id uuid,
  p_organization_id uuid,
  p_development_id uuid,
  p_limit integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role text;
  regra public.distribution_rules;
  contador integer;
  lead_escolhido uuid;
  corretor_escolhido uuid;
  carga_antes integer;
  distribuidos integer := 0;
  limite_presenca timestamptz;
begin
  if p_limit < 1 or p_limit > 100 then
    raise exception 'O lote deve conter entre 1 e 100 leads.';
  end if;

  -- O `else role` é obrigatório: sem ele, um papel fora da tríade mapeada (por exemplo
  -- 'superintendent' gravado só em role) vira NULL e some da checagem abaixo.
  select coalesce(commercial_role,
           case role when 'admin' then 'director' else role end)
    into actor_role
  from public.profiles
  where id = p_actor_id and organization_id = p_organization_id and active = true;

  -- O `is null` não é zelo excessivo, é a correção de um furo real: quando o SELECT
  -- acima não acha linha (ator inexistente, inativo ou de outra organização),
  -- actor_role fica NULL, e `NULL not in (...)` avalia como NULL — não como verdadeiro.
  -- O IF não dispara e a função seguia adiante distribuindo leads para um ator que o
  -- banco nunca autenticou. Testado em homologação antes desta linha existir.
  if actor_role is null or actor_role not in ('director', 'superintendent', 'manager') then
    raise exception 'Perfil sem permissão para distribuir leads.';
  end if;

  if not exists (select 1 from public.developments
                 where id = p_development_id and organization_id = p_organization_id) then
    raise exception 'Projeto inválido.';
  end if;

  regra := public.effective_distribution_rule(p_organization_id, p_development_id);
  limite_presenca := pg_catalog.now() - make_interval(secs => regra.presence_window_seconds);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text || p_development_id::text, 0));

  for contador in 1..p_limit loop
    -- Ordem da fila conforme a regra. O CASE evita SQL dinâmico: o plano é estável e
    -- não há superfície de injeção. O desempate por created_at/id garante determinismo
    -- em qualquer critério — dois leads empatados sempre saem na mesma ordem.
    select l.id into lead_escolhido
    from public.leads l
    where l.organization_id = p_organization_id
      and l.development_id = p_development_id
      and l.assigned_to is null
    order by
      case regra.queue_order
        when 'highest_score' then -coalesce(l.score_ia, l.score, 0)
        when 'hottest' then
          case lower(coalesce(l.temperature, ''))
            when 'quente' then 0 when 'hot' then 0
            when 'morno' then 1 when 'warm' then 1
            else 2 end
        else 0
      end,
      case when regra.queue_order = 'sla_risk'
           then coalesce(l.first_contact_due_at, 'infinity'::timestamptz)
           else 'infinity'::timestamptz end,
      l.created_at, l.id
    for update skip locked
    limit 1;

    exit when lead_escolhido is null;

    with recursive descendentes as (
      select id from public.profiles where id = p_actor_id
      union all
      select p.id from public.profiles p join descendentes d on p.reports_to = d.id
      where p.organization_id = p_organization_id and p.active = true
    ), candidatos as (
      select p.id,
        count(l.id)::integer as carga_projeto,
        coalesce(m.weight, 1) as peso,
        coalesce(m.assignments_count, 0) as total_recebido,
        m.last_assigned_at,
        (select count(*) from public.lead_distribution_events e
          where e.organization_id = p_organization_id
            and e.assigned_to = p.id
            and e.created_at >= date_trunc('day', pg_catalog.now()))::integer as recebidos_hoje
      from public.profiles p
      -- A presença só é exigida quando a regra manda. Com require_presence falso, o
      -- left join deixa passar quem nunca abriu a tela.
      left join public.commercial_presence cp
        on cp.profile_id = p.id
       and cp.organization_id = p_organization_id
       and cp.availability = 'available'
       and cp.last_seen_at >= limite_presenca
      left join public.project_distribution_members m
        on m.development_id = p_development_id and m.profile_id = p.id
      left join public.leads l
        on l.organization_id = p_organization_id
       and l.development_id = p_development_id
       and l.assigned_to = p.id
      where p.organization_id = p_organization_id
        and p.active = true
        and coalesce(p.commercial_role, p.role) = 'broker'
        and coalesce(m.enabled, true)
        and (actor_role = 'director' or p.id in (select id from descendentes))
        and (not regra.require_presence or cp.profile_id is not null)
      group by p.id, m.weight, m.assignments_count, m.last_assigned_at
    )
    select id, carga_projeto into corretor_escolhido, carga_antes
    from candidatos
    -- Teto diário: quem já bateu o limite sai da disputa, não recebe "por último".
    where regra.daily_cap_per_broker is null or recebidos_hoje < regra.daily_cap_per_broker
    order by
      case regra.broker_choice
        when 'round_robin' then 0
        when 'fewest_total' then total_recebido
        else (carga_projeto::numeric / greatest(peso, 1))
      end,
      last_assigned_at nulls first,
      id
    limit 1;

    if corretor_escolhido is null then
      if regra.require_presence then
        raise exception 'Nenhum corretor online e disponível para este projeto.';
      else
        raise exception 'Nenhum corretor elegível para este projeto (verifique tetos e participação).';
      end if;
    end if;

    update public.leads
       set assigned_to = corretor_escolhido, updated_at = pg_catalog.now()
     where id = lead_escolhido;

    insert into public.project_distribution_members
      (organization_id, development_id, profile_id, assignments_count, last_assigned_at, updated_at)
    values (p_organization_id, p_development_id, corretor_escolhido, 1, pg_catalog.now(), pg_catalog.now())
    on conflict (development_id, profile_id) do update set
      assignments_count = public.project_distribution_members.assignments_count + 1,
      last_assigned_at = excluded.last_assigned_at,
      updated_at = excluded.updated_at;

    -- O retrato guarda a REGRA em vigor no momento, não só a carga: sem isso, uma
    -- auditoria futura não consegue explicar por que aquele lead foi para aquele
    -- corretor, já que o critério pode ter mudado depois.
    insert into public.lead_distribution_events
      (organization_id, development_id, lead_id, assigned_to, actor_id, score_snapshot)
    values (p_organization_id, p_development_id, lead_escolhido, corretor_escolhido, p_actor_id,
      jsonb_build_object(
        'projectLoadBefore', carga_antes,
        'queueOrder', regra.queue_order,
        'brokerChoice', regra.broker_choice,
        'requirePresence', regra.require_presence,
        'presenceWindowSeconds', regra.presence_window_seconds,
        'dailyCapPerBroker', regra.daily_cap_per_broker
      ));

    distribuidos := distribuidos + 1;
    lead_escolhido := null;
    corretor_escolhido := null;
  end loop;

  return jsonb_build_object(
    'distributed', distribuidos,
    'rule', jsonb_build_object(
      'queueOrder', regra.queue_order,
      'brokerChoice', regra.broker_choice,
      'requirePresence', regra.require_presence,
      'presenceWindowSeconds', regra.presence_window_seconds,
      'dailyCapPerBroker', regra.daily_cap_per_broker,
      'scope', case when regra.id is null then 'default'
                    when regra.development_id is null then 'organization'
                    else 'development' end
    )
  );
end;
$$;

revoke all on function public.distribute_project_leads(uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.distribute_project_leads(uuid, uuid, uuid, integer) to authenticated, service_role;
