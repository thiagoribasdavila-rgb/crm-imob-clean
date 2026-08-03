-- ============================================================================
-- O PORTÃO DO WHATSAPP VIRA REGRA DA ORGANIZAÇÃO, E DEIXA DE SER LEI DO CÓDIGO
-- ============================================================================
--
-- ── O que foi medido em 03/08/2026 ─────────────────────────────────────────
--
-- `lib/distribution/hierarchical-cascade.ts` exige, em TODOS os degraus da
-- cascata — inclusive no dono padrão da fonte — que o corretor tenha uma sessão
-- de WhatsApp com status 'conectado'. O comentário no código defende a regra:
-- abrir exceção seria "a porta pela qual a regra deixaria de valer na prática".
--
-- O estado real da base:
--
--     whatsapp_broker_sessions ............ 0 linhas em TODA a base
--     meta_lead_sources com dono padrão ... 7
--     leads sem dono ...................... 55
--     /api/v1/whatsapp/broker/status ...... 404 em produção
--
-- Sete fontes apontam para um corretor, a ingestão honra esse campo, e toda
-- lead nasce órfã: o portão barra antes. A ponte do WhatsApp aponta para
-- `127.0.0.1:8790` — um processo que precisa rodar no VPS — e a rota nem existe
-- no ar. A precondição não é alcançável, e nada distribui.
--
-- ── Por que uma COLUNA, e não uma exceção no código ───────────────────────
--
-- A regra é boa: um corretor sem WhatsApp conectado não consegue atender a lead
-- de mídia paga no prazo, e mandá-la para ele é perder verba em silêncio. O
-- problema não é a regra — é ela estar cravada, sem dono e sem como uma
-- operação que não usa a integração dizer "aqui não vale".
--
-- Cravada, ela também é invisível: quem olha a fila vê 55 leads sem dono e
-- nenhuma explicação. Como coluna, ela aparece ao lado de `require_presence`,
-- que já existe e resolve o mesmo tipo de pergunta.
--
-- PADRÃO `true`: nada muda para quem já usa. Nenhuma organização é afetada por
-- esta migração — ela só passa a PODER decidir.
-- ============================================================================

begin;

alter table public.distribution_rules
  add column if not exists require_whatsapp boolean not null default true;

comment on column public.distribution_rules.require_whatsapp is
  'Exige sessão de WhatsApp conectada para o corretor receber lead. Padrão true '
  '(comportamento histórico, cravado em hierarchical-cascade.ts até 03/08/2026). '
  'Desligar permite distribuir para quem tem dono padrão definido mesmo sem a '
  'ponte de WhatsApp no ar — medido: 0 sessões em toda a base e 55 leads sem dono.';

-- ── O RODÍZIO DA FONTE ────────────────────────────────────────────────────
--
-- `meta_lead_sources.default_owner_id` aceita UM dono. Para alternar entre dois
-- corretores é preciso uma lista, e ela precisa de ordem estável — senão o
-- "próximo" muda conforme o banco devolve as linhas, e ninguém consegue
-- reproduzir quem deveria ter recebido.
create table if not exists public.source_round_robin (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_id uuid not null references public.meta_lead_sources(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- A ordem declarada. Empate resolvido por ela, nunca pela ordem física.
  posicao integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uma pessoa aparece UMA vez por fonte: repetir a mesma no rodízio dobraria a
-- chance dela em silêncio, e ninguém olharia a tabela para descobrir por quê.
create unique index if not exists source_round_robin_unico
  on public.source_round_robin (source_id, profile_id);
create unique index if not exists source_round_robin_posicao
  on public.source_round_robin (source_id, posicao);
create index if not exists source_round_robin_lookup
  on public.source_round_robin (organization_id, source_id) where active = true;

comment on table public.source_round_robin is
  'Rodízio de corretores por fonte Meta. Existe porque meta_lead_sources.default_owner_id '
  'aceita UM dono e a operação precisa alternar entre dois ou mais. A escolha do próximo '
  'não guarda estado: é feita pelo MENOR número de leads já recebidas daquela fonte, com '
  '`posicao` como desempate — assim o rodízio se autocorrige quando alguém entra, sai ou '
  'fica sem receber.';

alter table public.source_round_robin enable row level security;

-- Leitura para a organização; escrita só por service_role, como as irmãs.
create policy source_round_robin_select_org on public.source_round_robin
  for select to authenticated
  using (organization_id = (select p.organization_id from public.profiles p where p.id = (select auth.uid())));

revoke insert, update, delete on public.source_round_robin from anon, authenticated;
grant select on public.source_round_robin to authenticated;

commit;
