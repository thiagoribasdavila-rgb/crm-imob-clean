-- ELENCO DE DISTRIBUIÇÃO — quem participa da fila de cada projeto/campanha.
--
-- Antes disto a cascata tratava a equipe como intercambiável: distribuía por
-- carga e disponibilidade, e pronto. Quem trabalha o Arvo recebia lead do Spin
-- Mood por ter a fila mais curta, no mesmo instante em que o SLA começa a correr.
--
-- INCREMENTAL e reversível: tabela nova, nada é alterado nem apagado. Sem
-- nenhuma linha aqui o comportamento é EXATAMENTE o de hoje — a ausência de
-- elenco significa "fila aberta a toda a equipe".

create table if not exists public.distribution_roster (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- 'projeto' aponta para um empreendimento; 'campanha' para uma campanha de
  -- origem. Texto e não FK: campanha vive na Meta e nem sempre tem linha local,
  -- e o produto já convive com DUAS tabelas de empreendimento (developments e
  -- crm_projects) com ids diferentes. Amarrar em FK aqui escolheria uma das
  -- duas por acidente.
  escopo text not null check (escopo in ('projeto', 'campanha')),
  escopo_id text not null,

  profile_id uuid not null references public.profiles(id) on delete cascade,

  -- Desativar preserva o histórico de quem já participou e permite reativar sem
  -- recadastrar. Remover a linha perderia isso.
  ativo boolean not null default true,

  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Uma pessoa entra uma vez por escopo. Sem isto, dois cliques no botão criariam
-- duas linhas e o corretor apareceria em dobro na contagem do elenco.
create unique index if not exists distribution_roster_unico
  on public.distribution_roster (organization_id, escopo, escopo_id, profile_id);

-- O caminho quente: toda lead que entra pergunta "quem participa deste escopo?".
create index if not exists distribution_roster_busca
  on public.distribution_roster (organization_id, escopo, escopo_id)
  where ativo;

comment on table public.distribution_roster is
  'Quem participa da fila de distribuição de cada projeto/campanha. Sem linha = fila aberta a todos. Campanha vence projeto.';

alter table public.distribution_roster enable row level security;

-- Leitura: qualquer pessoa da organização. Saber quem atende o quê não é
-- segredo dentro da casa, e o corretor precisa entender por que não recebeu.
drop policy if exists distribution_roster_leitura on public.distribution_roster;
create policy distribution_roster_leitura on public.distribution_roster
  for select using (
    organization_id in (select p.organization_id from public.profiles p where p.id = auth.uid())
  );

-- Escrita: só liderança. Montar time é decisão de gestão — se o próprio
-- corretor pudesse se incluir, o elenco deixaria de significar alguma coisa.
drop policy if exists distribution_roster_escrita on public.distribution_roster;
create policy distribution_roster_escrita on public.distribution_roster
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = distribution_roster.organization_id
        and coalesce(p.commercial_role, p.role) in ('manager', 'director', 'admin', 'GERENTE-DIRETOR')
    )
  );

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Esta migration é ADITIVA e IDEMPOTENTE: `if not exists` em tabela, índice e
-- política, e os `drop policy if exists` tocam apenas as políticas desta tabela.
-- Reaplicar não faz nada; não altera nem apaga dado de nenhuma outra tabela.
--
-- Para desfazer por completo (a tabela nasce vazia, então nada se perde):
--
--   drop table if exists public.distribution_roster;
--
-- O produto continua funcionando sem ela: `carregarElenco()` em
-- `lib/distribution/hierarchical-cascade.ts` devolve `[]` quando a leitura
-- falha, e elenco vazio significa "fila aberta a toda a equipe" — que é o
-- comportamento anterior a esta feature, não um estado quebrado.
