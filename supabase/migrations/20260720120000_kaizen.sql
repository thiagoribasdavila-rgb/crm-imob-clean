-- Kaizen — canal de melhoria contínua dos corretores.
-- Qualquer pessoa da operação propõe; a liderança avalia (impacto×esforço).

create table if not exists public.kaizen_ideas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  title text not null,
  description text not null,
  category text not null default 'outro',
  impact int not null default 3,
  effort int not null default 3,
  priority numeric not null default 1,
  quadrant text,
  status text not null default 'nova'
    check (status in ('nova','em_analise','aprovada','implementada','rejeitada')),
  votes int not null default 0,
  decided_by uuid references public.profiles(id) on delete set null,
  decision_reason text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kaizen_votes (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.kaizen_ideas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (idea_id, user_id)
);

create index if not exists idx_kaizen_org_status on public.kaizen_ideas (organization_id, status);
create index if not exists idx_kaizen_org_priority on public.kaizen_ideas (organization_id, priority desc, created_at desc);
create index if not exists idx_kaizen_votes_idea on public.kaizen_votes (idea_id);

alter table public.kaizen_ideas enable row level security;
alter table public.kaizen_votes enable row level security;
