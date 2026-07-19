-- RBAC Enterprise (modelo híbrido) — fundação configurável no banco.
-- Complementa (não substitui) o RBAC legado de profiles/RLS: as tabelas abaixo
-- preparam permissões configuráveis por organização. Em runtime, a fonte de
-- verdade continua sendo o catálogo em código (lib/auth/permissions.ts) até que
-- os overrides de banco sejam ativados numa fase seguinte. Aditivo e não-destrutivo.

-- Papéis (sistema = organization_id null; organização pode criar customizados no futuro)
create table if not exists public.roles(
  id uuid primary key default gen_random_uuid(),
  key text not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  organization_id uuid references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists roles_system_key_idx on public.roles(key) where organization_id is null;
create unique index if not exists roles_org_key_idx on public.roles(organization_id, key) where organization_id is not null;

-- Catálogo global de permissões (módulo + ação)
create table if not exists public.permissions(
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  module text not null,
  action text not null,
  description text,
  created_at timestamptz not null default now()
);

-- Mapa papel → permissão
create table if not exists public.role_permissions(
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  allowed boolean not null default true,
  primary key(role_id, permission_id)
);

-- Atribuição explícita de papel a usuário (marketing/incorporadora/ia_agent etc.)
create table if not exists public.user_roles(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  assigned_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(organization_id, user_id, role_id)
);
create index if not exists user_roles_user_idx on public.user_roles(organization_id, user_id);

-- Log de auditoria com IP e user-agent
create table if not exists public.audit_logs(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action text not null,
  module text not null,
  resource_type text,
  resource_id text,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_org_idx on public.audit_logs(organization_id, created_at desc);
create index if not exists audit_logs_actor_idx on public.audit_logs(organization_id, actor_id, created_at desc);

-- ---------- RLS ----------
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.audit_logs enable row level security;

create policy roles_read on public.roles for select to authenticated
  using(organization_id is null or organization_id=(select public.current_organization_id()));
create policy permissions_read on public.permissions for select to authenticated using(true);
create policy role_permissions_read on public.role_permissions for select to authenticated
  using(exists(select 1 from public.roles r where r.id=role_id and (r.organization_id is null or r.organization_id=(select public.current_organization_id()))));
create policy user_roles_read on public.user_roles for select to authenticated
  using(organization_id=(select public.current_organization_id()));
create policy audit_logs_read on public.audit_logs for select to authenticated
  using(organization_id=(select public.current_organization_id()) and exists(select 1 from public.profiles p where p.id=auth.uid() and (coalesce(p.commercial_role,case when p.role='admin' then 'director' else p.role end)='director' or p.role='admin')));

revoke all on public.roles, public.permissions, public.role_permissions, public.user_roles, public.audit_logs from anon, authenticated;
grant select on public.roles, public.permissions, public.role_permissions, public.user_roles, public.audit_logs to authenticated;

-- ---------- SEED (papéis de sistema + catálogo + matriz padrão) ----------
insert into public.roles(key,name,is_system) values
  ('admin_master','Administrador Master',true),
  ('diretor','Diretor',true),
  ('gerente','Gerente Comercial',true),
  ('corretor','Corretor',true),
  ('marketing','Marketing',true),
  ('incorporadora','Incorporadora / Parceiro',true),
  ('ia_agent','IA System Agent',true)
on conflict do nothing;

insert into public.permissions(key,module,action,description) values
  ('leads.view','leads','view','Ver as próprias leads'),
  ('leads.view_team','leads','view_team','Ver leads da equipe'),
  ('leads.create','leads','create','Criar leads'),
  ('leads.edit','leads','edit','Editar leads'),
  ('leads.assign','leads','assign','Distribuir leads'),
  ('leads.transfer','leads','transfer','Transferir leads'),
  ('leads.import','leads','import','Importar leads'),
  ('leads.export','leads','export','Exportar leads'),
  ('clients.view','clients','view','Consultar clientes'),
  ('clients.edit','clients','edit','Editar clientes'),
  ('clients.history','clients','history','Ver histórico do cliente'),
  ('clients.documents','clients','documents','Acessar documentos do cliente'),
  ('users.view','users','view','Ver usuários'),
  ('users.create','users','create','Criar/convidar usuários'),
  ('users.edit','users','edit','Editar usuários'),
  ('users.delete','users','delete','Desativar/remover usuários'),
  ('projects.view','projects','view','Ver projetos'),
  ('projects.create','projects','create','Cadastrar projetos'),
  ('projects.edit','projects','edit','Editar projetos'),
  ('projects.publish','projects','publish','Publicar projetos'),
  ('campaigns.view','campaigns','view','Ver campanhas'),
  ('campaigns.create','campaigns','create','Criar campanhas'),
  ('campaigns.manage','campaigns','manage','Gerenciar campanhas'),
  ('campaigns.pause','campaigns','pause','Pausar campanhas'),
  ('reports.view','reports','view','Ver relatórios'),
  ('reports.create','reports','create','Criar relatórios'),
  ('reports.export','reports','export','Exportar relatórios'),
  ('financial.view','financial','view','Ver financeiro'),
  ('financial.edit','financial','edit','Editar financeiro'),
  ('financial.approve','financial','approve','Aprovar financeiro'),
  ('ai.use','ai','use','Usar a IA (copilot)'),
  ('ai.configure','ai','configure','Configurar a IA'),
  ('ai.train','ai','train','Treinar/calibrar a IA'),
  ('ai.manage','ai','manage','Administrar a IA'),
  ('integrations.view','integrations','view','Ver integrações'),
  ('integrations.manage','integrations','manage','Gerenciar integrações'),
  ('settings.view','settings','view','Ver configurações'),
  ('settings.manage','settings','manage','Alterar configurações globais'),
  ('audit.view','audit','view','Ver logs de auditoria')
on conflict do nothing;

-- admin_master: todas
insert into public.role_permissions(role_id,permission_id)
  select r.id,p.id from public.roles r cross join public.permissions p
  where r.key='admin_master' and r.organization_id is null on conflict do nothing;

-- demais papéis: matriz padrão (espelha lib/auth/permissions.ts)
insert into public.role_permissions(role_id,permission_id)
  select r.id, p.id
  from (values
    ('diretor', array['leads.view','leads.view_team','leads.export','clients.view','clients.history','users.view','projects.view','campaigns.view','reports.view','reports.create','reports.export','financial.view','financial.edit','financial.approve','ai.use','integrations.view','settings.view','audit.view']),
    ('gerente', array['leads.view','leads.view_team','leads.assign','leads.transfer','leads.export','clients.view','clients.history','users.view','projects.view','campaigns.view','reports.view','reports.export','financial.view','ai.use']),
    ('corretor', array['leads.view','leads.create','leads.edit','clients.view','clients.history','projects.view','reports.view','ai.use']),
    ('marketing', array['campaigns.view','campaigns.create','campaigns.manage','campaigns.pause','integrations.view','integrations.manage','reports.view','reports.export','ai.use']),
    ('incorporadora', array['projects.view','projects.create','projects.edit','projects.publish','reports.view']),
    ('ia_agent', array['ai.use','leads.view','leads.view_team','clients.view','projects.view','reports.view'])
  ) as perm(role_key, keys)
  join public.roles r on r.key = perm.role_key and r.organization_id is null
  join public.permissions p on p.key = any(perm.keys)
  on conflict do nothing;
