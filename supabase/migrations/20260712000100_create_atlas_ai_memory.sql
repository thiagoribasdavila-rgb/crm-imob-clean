create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','tool')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_tool_calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  tool_name text not null,
  success boolean not null default false,
  latency_ms integer,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  model text,
  input_tokens integer default 0,
  output_tokens integer default 0,
  latency_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_conversations_org on public.ai_conversations(organization_id);
create index if not exists idx_ai_messages_conversation on public.ai_messages(conversation_id);
create index if not exists idx_ai_tool_calls_conversation on public.ai_tool_calls(conversation_id);
create index if not exists idx_ai_usage_org on public.ai_usage(organization_id);
