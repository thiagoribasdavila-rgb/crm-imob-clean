-- =============================================================================
-- OFERTA ATIVA DO ACERVO DE RESGATE — o corretor se serve, 10 por vez
-- =============================================================================
--
-- ── O PEDIDO, NAS PALAVRAS DO DONO ──────────────────────────────────────────
-- "essas leads serão para os corretores poderem trabalhar para resgatar
--  clientes, preciso de um campo de oferta ativa que eles possam pegar 10 leads
--  por vez para sua base"
--
-- ── POR QUE UMA RPC NOVA, E NÃO REUSAR AS TRÊS QUE EXISTEM (medido) ─────────
--
-- 1) `accept_lead_assignment` NÃO SERVE: exige reserva `status='pending'`
--    (`reservation_not_found`) E exige que a lead JÁ esteja com o ator
--    (`assigned_to = p_actor_id` → `reservation_owner_changed`). Medido:
--    `lead_assignment_reservations` tem 0 linhas — total, não só pendentes. Para
--    um pool de auto-serviço ela levantaria `reservation_not_found` em 100% das
--    chamadas, e criar a reserva para mim mesmo antes de aceitar É o claim. Ela
--    segue sendo o ACEITE do que a liderança reservou PARA você.
-- 2) `distribute_project_leads_v3/v4` NÃO ALCANÇAM O ACERVO: a fila é
--    `where l.development_id = p_development_id` e v3 levanta
--    `distribution_project_invalid` se o empreendimento não existir. As 13 leads
--    do pool têm `development_id = NULL` — v3/v4 nunca as veem. E as duas
--    levantam `distribution_actor_forbidden` fora de director/superintendent/
--    manager.
-- 3) O laço em Node de `action=distribute` é 403 para corretor e filtra só
--    `!lead.assigned_to`. Medido: 1 lead da base tem `assigned_user_id`
--    preenchido com `assigned_to` nulo — o fallback da liderança
--    REDISTRIBUIRIA uma lead que já tem dono. Por isso o claim grava AS DUAS
--    colunas, sempre.
--
-- ── O QUE ESTA MIGRATION REUSA (nada reinventado) ───────────────────────────
-- · `lead_assignment_reservations` + o índice único parcial
--   `lead_assignment_one_pending_idx` — cerca contra dois donos no nível do índice;
-- · `pg_advisory_xact_lock` + `for update skip locked`, o mesmo par que
--   `distribute_project_leads_v3` (seed 57) e `guard_broker_portfolio_capacity`
--   (seed 56) já usam. A oferta usa **seed 58** sobre `org||broker`;
-- · `lead_distribution_history` + `lead_events` para o rastro — é o que
--   `get_portfolio_audit_ledger` lê (e ele transforma a reserva em evento
--   `reservation_accepted`, então a liderança VÊ o auto-serviço acontecendo);
-- · `first_contact_sla_policies` para o prazo, agora com `rescue_minutes`;
-- · `broker_capacity_limits` conferido DENTRO da RPC (ver abaixo por quê).
--
-- ── A MEDIÇÃO QUE MUDA O ENUNCIADO ──────────────────────────────────────────
-- "o corretor não tem nenhum caminho de auto-atendimento" era verdade só para o
-- LOTE. Em `app/api/v1/leads/[id]/route.ts`, `action=accept_assignment` cai num
-- fallback quando a RPC responde `reservation_not_found` e executa
-- `update leads set assigned_user_id = <eu> where assigned_user_id is null`.
-- Hoje um corretor já adota lead órfã UMA POR VEZ, sem liderança, sem teto e
-- gravando SÓ uma coluna. Esta feature não abre uma porta nova — ela fecha uma
-- porta que já está aberta do jeito errado.
-- =============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) O PRAZO DO RESGATE, configurável — 24h, não 15 minutos
-- ─────────────────────────────────────────────────────────────────────────────
-- Medido: `first_contact_sla_policies` tem 0 linhas, então hoje valem os
-- defaults do código (15 min padrão / 5 min mídia paga). Lead histórica não tem
-- meia-vida de 15 minutos; prazo que nasce estourado não é prazo.
alter table public.first_contact_sla_policies
  add column if not exists rescue_minutes integer not null default 1440;

do $do$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.first_contact_sla_policies'::regclass
      and conname = 'first_contact_sla_policies_rescue_minutes_check'
  ) then
    alter table public.first_contact_sla_policies
      add constraint first_contact_sla_policies_rescue_minutes_check
      check (rescue_minutes between 15 and 20160);
  end if;
end $do$;

comment on column public.first_contact_sla_policies.rescue_minutes is
  'Prazo de primeiro contato (minutos) para lead de ACERVO pega na oferta ativa. Default 1440 (24h): lead histórica não tem meia-vida de 15 minutos.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) ACERVO ENTRA SEM PRAZO — a saída antecipada do gatilho de SLA
-- ─────────────────────────────────────────────────────────────────────────────
-- ── POR QUE ISTO NÃO DAVA PARA RESOLVER SÓ NA RPC ───────────────────────────
--
-- O cálculo era `coalesce(new.first_contact_due_at, created_at + interval)`.
-- Como o `coalesce` só respeita valor JÁ preenchido, o importador não tinha como
-- pedir "sem prazo": passar NULL é exatamente o que aciona o cálculo. Resultado
-- medido nas 13 leads já migradas: 13/13 com `first_contact_due_at` no PASSADO
-- (06/06 a 14/07) e `first_contact_sla_minutes = 15`.
--
-- Com 16.721 leads faltando, a central mostraria ~17 mil violações de primeiro
-- contato no dia da importação — e a métrica que revelou que o gargalo é
-- DISTRIBUIÇÃO morreria afogada nelas.
--
-- ── O QUE NÃO MUDA ──────────────────────────────────────────────────────────
-- Lead que NÃO é de importação continua recebendo prazo exatamente como antes,
-- inclusive os 5 minutos de mídia paga. A saída antecipada exige as três
-- condições juntas — lote de importação, sem primeiro contato, e sem prazo já
-- pedido explicitamente — para que um importador que QUEIRA prazo continue
-- podendo passá-lo.
create or replace function public.apply_first_contact_sla()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  policy_row public.first_contact_sla_policies%rowtype;
  minutes_value integer;
begin
  if new.first_contacted_at is not null or new.last_interaction_at is not null then
    return new;
  end if;

  -- ACERVO DE RESGATE: entra SEM prazo. O relógio nasce no claim — pegar é
  -- assumir. Sem esta saída, importar o acervo cria ~17 mil violações de SLA
  -- de gente que nunca pediu contato nenhum.
  if new.import_batch_id is not null
     and new.first_contacted_at is null
     and new.first_contact_due_at is null then
    return new;
  end if;

  select * into policy_row
  from public.first_contact_sla_policies
  where organization_id = new.organization_id;

  if policy_row.organization_id is null then
    policy_row.enabled := true;
    policy_row.default_minutes := 15;
    policy_row.meta_minutes := 5;
  end if;

  if not coalesce(policy_row.enabled, true) then
    return new;
  end if;

  minutes_value := case
    when public.is_paid_social_source(new.source) then coalesce(policy_row.meta_minutes, 5)
    else coalesce(policy_row.default_minutes, 15)
  end;

  new.first_contact_sla_minutes := coalesce(new.first_contact_sla_minutes, minutes_value);
  new.first_contact_due_at := coalesce(
    new.first_contact_due_at,
    coalesce(new.created_at, now()) + make_interval(mins => new.first_contact_sla_minutes)
  );

  return new;
end
$function$;

revoke all on function public.apply_first_contact_sla() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) O PREDICADO DO POOL — uma definição, dois consumidores
-- ─────────────────────────────────────────────────────────────────────────────
-- O claim e o contador PRECISAM concordar sobre o que é "disponível". Duas
-- cópias do mesmo predicado é a classe de defeito mais cara deste repositório
-- (`move.moveId` vs `move.id`, `pipeline_history` vs `pipeline_stage_moves`,
-- `developments` vs `crm_projects`). Aqui existe UMA, e as duas a chamam.
--
-- ── POR QUE CADA CLÁUSULA, COM NÚMERO (medido em 2026-07-29/30) ─────────────
--
-- · `import_batch_id is not null` SOZINHO é armadilha: 283 leads têm lote, mas
--   270 delas (lote 567dbb19, "Relatório Arvo") estão TODAS com dono —
--   270/270 com `assigned_to` E `assigned_user_id`. O recorte só não as engole
--   porque exige as duas colunas nulas.
-- · AS DUAS COLUNAS: 3 leads têm `assigned_to` preenchido com `assigned_user_id`
--   nulo. Um pool por `assigned_user_id is null` — que é exatamente o predicado
--   do painel "Leads abertos sem responsável" — ofereceria 3 leads que JÁ TÊM
--   DONO. Aquele painel mostra 17 linhas hoje: 13 acervo + 3 com dono + 1 de
--   teste, ou seja 18% de falso positivo.
-- · `duplicate_state = 'canonical'`: nunca oferecer uma fusão.
-- · a lista de status: 8 das 13 do pool estão em `perdido`, 3 em `novo`, 2 em
--   `contato`; nenhuma em ganho/comprou_outro. No v1 existem 4 `comprou_outro` —
--   daí a exclusão explícita.
-- · telefone OU e-mail: sem canal não há resgate.
-- · `not exists activities` / `not exists conversations`: o cenário perigoso é
--   real e futuro — `process_expired_lead_reservations` zera `assigned_to` de
--   lead que alguém já tocou, e sem estas cláusulas ela voltaria ao balcão.
--   Medido hoje: as 13 têm 0 atividades, 0 conversas, 0 reservas pendentes.
-- · `not exists reservas pendentes`: se a liderança reservou, o acervo não
--   oferece a mesma linha por outro caminho.
--
-- Executado na base viva (org 7c8c71c1): 13 leads — o MESMO 13 do recorte
-- simples. Ou seja, as cláusulas de proteção não custam nada hoje e são o que
-- impede o pior defeito amanhã.
create or replace function private.lead_esta_no_acervo_de_resgate(l public.leads)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select l.import_batch_id is not null
     and l.assigned_to is null
     and l.assigned_user_id is null
     and l.duplicate_state = 'canonical'
     and lower(coalesce(l.status, 'novo')) not in
         ('ganho', 'won', 'vendido', 'venda', 'contrato', 'proposta', 'comprou_outro')
     and (l.phone_normalized is not null or l.email_normalized is not null)
     and not exists (
       select 1 from public.activities a
       where a.lead_id = l.id and coalesce(a.type, '') <> 'system'
     )
     and not exists (
       select 1 from public.conversations c where c.lead_id = l.id
     )
     and not exists (
       select 1 from public.lead_assignment_reservations r
       where r.lead_id = l.id and r.status = 'pending'
     );
$$;

comment on function private.lead_esta_no_acervo_de_resgate(public.leads) is
  'Predicado ÚNICO do acervo de resgate: lead histórica sem dono nas duas colunas, canônica, fora de status fechado, com canal, sem atividade/conversa/reserva. Chamado pelo claim e pelo contador — duas cópias divergiriam.';

-- A ordenação do pool é `(phone_normalized is null), created_at`: quem tem
-- telefone primeiro. Medido no v1: das 16.733 arquivadas, 7.106 têm telefone
-- utilizável e 9.627 têm APENAS e-mail — entregar lote de e-mail-sem-telefone a
-- quem vai LIGAR é a armadilha em forma de estatística.
create index if not exists leads_acervo_de_resgate_idx
  on public.leads (organization_id, created_at)
  where import_batch_id is not null
    and assigned_to is null
    and assigned_user_id is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) O CLAIM ATÔMICO
-- ─────────────────────────────────────────────────────────────────────────────
-- TRÊS CERCAS INDEPENDENTES contra dois corretores levando a mesma lead:
--   (a) `for update skip locked` — nenhuma sessão espera nem repete linha;
--   (b) a re-checagem `assigned_to is null and assigned_user_id is null` no
--       próprio UPDATE — idempotente mesmo se a trava falhasse;
--   (c) `lead_assignment_one_pending_idx`, índice único parcial na tabela de
--       reservas — dois pendentes para a mesma lead é impossível no índice.
--
-- A TRAVA É POR CORRETOR, não por organização: dois corretores não se esperam; o
-- MESMO corretor não roda dois claims em paralelo e fura a recarga. Seed 58 —
-- 56 é do teto de carteira, 57 é da distribuição v3.
create or replace function public.reservar_leads_do_acervo(
  p_actor_id uuid,
  p_organization_id uuid,
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_papel text;
  v_em_aberto integer;
  v_lotes_hoje integer;
  v_limites public.broker_capacity_limits%rowtype;
  v_carteira integer;
  v_espaco integer;
  v_prazo integer;
  v_agora timestamptz := now();
  v_dia text;
  v_lote integer := p_limit;
  v_pegos uuid[];
begin
  if p_limit < 1 or p_limit > 10 then
    raise exception 'acervo_limite_invalido';
  end if;

  select coalesce(commercial_role, role) into v_papel
  from public.profiles
  where id = p_actor_id and organization_id = p_organization_id and active = true;

  -- Auto-serviço do CORRETOR. Liderança tem `distribute` e transferência em
  -- lote; quem tem o poder de distribuir para os outros não se serve do balcão.
  if v_papel is distinct from 'broker' then
    raise exception 'acervo_ator_nao_e_corretor';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || p_actor_id::text, 58)
  );

  -- O dia é o dia DA OPERAÇÃO (America/Sao_Paulo), não o dia UTC: um teto
  -- diário que zera às 21h da noite anterior não é um teto diário.
  v_dia := to_char(v_agora at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');

  -- ── A REGRA DE RECARGA ────────────────────────────────────────────────────
  -- Contada pelo marcador DA OFERTA, nunca por `import_batch_id`: medido,
  -- viniciusadolfodasilva já tem 270 leads com lote de importação e 270/270 sem
  -- primeiro contato (o lote que a liderança empurrou). Contar por
  -- `import_batch_id` o bloquearia no dia 1 — justamente quem mais precisa de
  -- ajuda. Com o marcador, o contador de todo mundo começa em 0.
  --
  -- Descarte com motivo conta como toque: para lead que já está em `perdido`,
  -- mudar status não diz nada, então sem o marcador de descarte a regra
  -- congelaria o corretor com 5 leads que ele legitimamente não vai trabalhar.
  select count(*) into v_em_aberto
  from public.leads
  where organization_id = p_organization_id
    and (assigned_to = p_actor_id or assigned_user_id = p_actor_id)
    and metadata #>> '{acervo,pegoEm}' is not null
    and metadata #>> '{acervo,descartadoEm}' is null
    and first_contacted_at is null
    and last_interaction_at is null;

  if v_em_aberto >= 5 then
    raise exception 'acervo_recarga_bloqueada';
  end if;

  -- Teto diário de lotes. Cada lote grava o MESMO `pegoEm` em todas as suas
  -- leads (`v_agora` é um só na transação), então contar valores distintos é
  -- contar lotes. `pegoNoDia` evita cast de texto para timestamptz — uma linha
  -- com metadata estranho derrubaria a função inteira.
  select count(distinct metadata #>> '{acervo,pegoEm}') into v_lotes_hoje
  from public.leads
  where organization_id = p_organization_id
    and (assigned_to = p_actor_id or assigned_user_id = p_actor_id)
    and metadata #>> '{acervo,pegoNoDia}' = v_dia;

  if v_lotes_hoje >= 3 then
    raise exception 'acervo_lotes_do_dia_esgotados';
  end if;

  -- ── TETO HUMANO, QUANDO EXISTIR ───────────────────────────────────────────
  -- Conferido AQUI e não delegado a `guard_broker_portfolio_capacity`. Medido:
  -- o gatilho tem saída antecipada para status fechado, e executado com limite 1
  -- ele recusou a 2ª lead `novo` mas ACEITOU uma lead `perdido` estando
  -- estourado. Como 8 das 13 do pool (e 16.733 das 17.151 do v1) estão em
  -- perdido/arquivado, um corretor acumularia milhares lendo "0 de 100".
  -- Por isso a contagem aqui é de TODAS as leads da pessoa, sem filtro de status.
  -- Medido também: `broker_capacity_limits` tem 0 linhas — o gatilho está INERTE
  -- hoje, nenhum teto configurado. Este bloco é o que acontece quando houver.
  select * into v_limites
  from public.broker_capacity_limits
  where organization_id = p_organization_id and profile_id = p_actor_id;

  if v_limites.id is not null then
    select count(*) into v_carteira
    from public.leads
    where organization_id = p_organization_id
      and (assigned_to = p_actor_id or assigned_user_id = p_actor_id);

    v_espaco := v_limites.max_active_leads - v_carteira;
    if v_espaco <= 0 then
      raise exception 'broker_total_capacity_reached';
    end if;
    v_lote := least(v_lote, v_espaco);
  end if;

  select coalesce(rescue_minutes, 1440) into v_prazo
  from public.first_contact_sla_policies
  where organization_id = p_organization_id;
  v_prazo := coalesce(v_prazo, 1440);

  -- ── O CLAIM ───────────────────────────────────────────────────────────────
  with alvo as (
    select l.id
    from public.leads l
    where l.organization_id = p_organization_id
      and private.lead_esta_no_acervo_de_resgate(l.*)
    order by (l.phone_normalized is null), l.created_at
    for update skip locked
    -- Igual a `v_lote` para todo `v_em_aberto` alcançável (0..4) — a forma
    -- longa fica porque diz a intenção: nunca além do lote.
    limit least(v_lote, 5 - v_em_aberto + v_lote)
  ), gravado as (
    update public.leads l set
      -- AS DUAS COLUNAS, SEMPRE. O gatilho de teto só dispara em `assigned_to`;
      -- a listagem e a central leem as duas; e a ADOÇÃO de lead órfã hoje grava
      -- só `assigned_user_id` — passando por baixo do teto. 465 das 470 leads
      -- têm as duas preenchidas: essa é a convenção da base.
      assigned_to = p_actor_id,
      assigned_user_id = p_actor_id,
      -- Atribuição DIRETA, não `coalesce`: é isto que apaga o prazo vencido
      -- herdado pelas 13 já migradas. O gatilho de SLA não interfere — ele é
      -- BEFORE UPDATE OF source, created_at, last_interaction_at, e o claim não
      -- toca nenhuma das três.
      first_contact_sla_minutes = v_prazo,
      first_contact_due_at = v_agora + make_interval(mins => v_prazo),
      metadata = jsonb_set(
        coalesce(l.metadata, '{}'::jsonb), '{acervo}',
        jsonb_build_object(
          'pegoEm', v_agora,
          'pegoPor', p_actor_id,
          'pegoNoDia', v_dia,
          'prazoMinutos', v_prazo,
          'origem', 'oferta-ativa'
        ), true
      ),
      updated_at = v_agora
    from alvo a
    where l.id = a.id
      -- Re-checagem: cerca (b). Idempotente mesmo se a trava falhasse.
      and l.assigned_to is null
      and l.assigned_user_id is null
    returning l.id
  )
  select array_agg(id) into v_pegos from gravado;

  if v_pegos is null or array_length(v_pegos, 1) is null then
    raise exception 'acervo_vazio';
  end if;

  -- ── O RASTRO ──────────────────────────────────────────────────────────────
  -- `get_portfolio_audit_ledger` lê as três: o auto-serviço aparece para a
  -- liderança como distribuição, como evento da lead e como reserva aceita.
  insert into public.lead_distribution_history(organization_id, lead_id, assigned_user_id, reason)
  select p_organization_id, id, p_actor_id, 'acervo:auto-servico' from unnest(v_pegos) as id;

  insert into public.lead_events(organization_id, lead_id, event_type, type, description, created_by, metadata)
  select p_organization_id, id, 'lead_assigned', 'distribution',
         'Lead de resgate pega pelo próprio corretor na oferta ativa',
         p_actor_id,
         jsonb_build_object('algorithm', 'acervo:auto-servico', 'autoServico', true,
                            'loteEm', v_agora, 'prazoMinutos', v_prazo)
  from unnest(v_pegos) as id;

  -- Reserva nasce 'accepted': pegar É aceitar. Se nascesse 'pending',
  -- `process_expired_lead_reservations` devolveria ao balcão uma lead que o
  -- corretor acabou de assumir. `expires_at` é NOT NULL e aqui é decorativo —
  -- recebe o prazo do resgate para o extrato mostrar algo com significado.
  insert into public.lead_assignment_reservations(
    organization_id, lead_id, broker_id, status, reserved_at, expires_at, accepted_at)
  select p_organization_id, id, p_actor_id, 'accepted', v_agora,
         v_agora + make_interval(mins => v_prazo), v_agora
  from unnest(v_pegos) as id;

  return jsonb_build_object(
    'pegos', array_length(v_pegos, 1),
    'leadIds', to_jsonb(v_pegos),
    'prazoMinutos', v_prazo,
    'prazoAte', v_agora + make_interval(mins => v_prazo),
    'semToqueAntes', v_em_aberto,
    'lotesHojeAntes', v_lotes_hoje,
    'tetoConfigurado', v_limites.id is not null,
    'ambasAsColunas', true,
    'autoServico', true
  );
end $$;

comment on function public.reservar_leads_do_acervo(uuid, uuid, integer) is
  'Oferta ativa: o CORRETOR pega até 10 leads do acervo de resgate para a própria carteira. Atômica (advisory lock seed 58 + for update skip locked + re-checagem no update), grava as DUAS colunas de dono, carimba o prazo de resgate e recusa com motivo nomeado.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) O CONTADOR DA TELA — sem PII, antes do clique
-- ─────────────────────────────────────────────────────────────────────────────
-- Mesma régua do painel `unassignedPolicy` da distribuição (`metadataOnly:true,
-- piiExposed:false`): a oferta mostra canal, consentimento, status histórico e
-- corretor legado — nada que identifique a pessoa — até o corretor pegar.
create or replace function public.oferta_do_acervo(
  p_actor_id uuid,
  p_organization_id uuid,
  p_previa integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_papel text;
  v_disponivel integer;
  v_em_aberto integer;
  v_lotes_hoje integer;
  v_limites public.broker_capacity_limits%rowtype;
  v_carteira integer;
  v_prazo integer;
  v_dia text;
  v_previa jsonb;
  v_resumo jsonb;
begin
  if p_previa < 0 or p_previa > 10 then
    raise exception 'acervo_limite_invalido';
  end if;

  select coalesce(commercial_role, role) into v_papel
  from public.profiles
  where id = p_actor_id and organization_id = p_organization_id and active = true;

  -- CERCA DA ORGANIZAÇÃO, em profundidade. A rota só passa a organização do
  -- próprio chamador, então isto é inalcançável pela API — e é exatamente por
  -- isso que fica aqui: no dia em que alguém chamar a RPC de outro lugar, ela
  -- não conta o balcão de um tenant para quem não é de lá. Mesmo agregado sem
  -- PII é informação comercial de outra empresa.
  if v_papel is null then
    raise exception 'acervo_ator_fora_da_organizacao';
  end if;

  v_dia := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD');

  select count(*) into v_disponivel
  from public.leads l
  where l.organization_id = p_organization_id
    and private.lead_esta_no_acervo_de_resgate(l.*);

  select count(*) into v_em_aberto
  from public.leads
  where organization_id = p_organization_id
    and (assigned_to = p_actor_id or assigned_user_id = p_actor_id)
    and metadata #>> '{acervo,pegoEm}' is not null
    and metadata #>> '{acervo,descartadoEm}' is null
    and first_contacted_at is null
    and last_interaction_at is null;

  select count(distinct metadata #>> '{acervo,pegoEm}') into v_lotes_hoje
  from public.leads
  where organization_id = p_organization_id
    and (assigned_to = p_actor_id or assigned_user_id = p_actor_id)
    and metadata #>> '{acervo,pegoNoDia}' = v_dia;

  select * into v_limites
  from public.broker_capacity_limits
  where organization_id = p_organization_id and profile_id = p_actor_id;

  if v_limites.id is not null then
    select count(*) into v_carteira
    from public.leads
    where organization_id = p_organization_id
      and (assigned_to = p_actor_id or assigned_user_id = p_actor_id);
  end if;

  select coalesce(rescue_minutes, 1440) into v_prazo
  from public.first_contact_sla_policies
  where organization_id = p_organization_id;
  v_prazo := coalesce(v_prazo, 1440);

  -- A PRÉVIA — o que o corretor está pegando, na MESMA ordem em que o claim
  -- pega. Ordem diferente aqui faria a tela prometer um lote e o botão entregar
  -- outro; é a classe de bug "lista copiada diverge".
  with fila as (
    select l.status, l.phone_normalized, l.email_normalized, l.created_at,
           l.data_quality_status, l.data_quality_percent, l.metadata
    from public.leads l
    where l.organization_id = p_organization_id
      and private.lead_esta_no_acervo_de_resgate(l.*)
    order by (l.phone_normalized is null), l.created_at
    limit p_previa
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'status', coalesce(f.status, 'novo'),
    'temTelefone', f.phone_normalized is not null,
    'temEmail', f.email_normalized is not null,
    -- `metadata->meta->estado` é a fonte que lib/crm/meta-consent.ts define.
    -- Ausência de registro é `nao_perguntado`, NUNCA "sem restrição".
    'consentimento', coalesce(f.metadata #>> '{meta,estado}', 'nao_perguntado'),
    'corretorLegado', f.metadata #>> '{legacy_broker}',
    'qualidade', coalesce(f.data_quality_status, 'critical'),
    'qualidadePercent', coalesce(f.data_quality_percent, 0),
    'criadoEm', f.created_at
  ) order by (f.phone_normalized is null), f.created_at), '[]'::jsonb)
  into v_previa
  from fila f;

  select jsonb_build_object(
    'comTelefone', count(*) filter (where l.phone_normalized is not null),
    'comEmail', count(*) filter (where l.email_normalized is not null),
    'semConsentimento', count(*) filter (
      where coalesce(l.metadata #>> '{meta,estado}', 'nao_perguntado') <> 'concedido'),
    'emStatusFechado', count(*) filter (
      where lower(coalesce(l.status, 'novo')) in ('perdido', 'arquivado'))
  ) into v_resumo
  from public.leads l
  where l.organization_id = p_organization_id
    and private.lead_esta_no_acervo_de_resgate(l.*);

  return jsonb_build_object(
    'papel', v_papel,
    'disponivel', v_disponivel,
    'semToque', v_em_aberto,
    'lotesHoje', v_lotes_hoje,
    'tetoDeCarteira', v_limites.max_active_leads,
    'carteiraTotal', v_carteira,
    'prazoMinutos', v_prazo,
    'previa', v_previa,
    'resumo', v_resumo,
    'piiExposed', false,
    'geradoEm', now()
  );
end $$;

comment on function public.oferta_do_acervo(uuid, uuid, integer) is
  'Contadores e prévia SEM PII da oferta ativa do acervo: quantas disponíveis, quantas do corretor estão sem toque, lotes de hoje, teto e o que o próximo lote traria (canal, consentimento, status, corretor legado).';

-- Só o cliente de serviço. A rota autentica e decide; nenhuma sessão de
-- navegador chama isto direto — o mesmo padrão de `configure_broker_capacity`.
revoke all on function public.reservar_leads_do_acervo(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.reservar_leads_do_acervo(uuid, uuid, integer) to service_role;
revoke all on function public.oferta_do_acervo(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.oferta_do_acervo(uuid, uuid, integer) to service_role;
revoke all on function private.lead_esta_no_acervo_de_resgate(public.leads) from public, anon, authenticated;
grant execute on function private.lead_esta_no_acervo_de_resgate(public.leads) to service_role;

commit;
