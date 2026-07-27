-- ════════════════════════════════════════════════════════════════════════════
-- PRESENÇA VIVA DO CORRETOR + SESSÃO DE WHATSAPP POR CORRETOR
--
-- Medido no banco vivo antes de escrever isto:
--   · 7 de 7 perfis estão AVAILABLE — inclusive a conta de sistema de ingestão.
--     A bandeira nunca é abaixada porque nada a abaixa.
--   · Não existe registro de QUANDO isso foi verdade. A rota de distribuição
--     devolve `last_seen_at: profile.created_at` — a data em que a conta foi
--     criada, com o nome de "visto por último".
--   · conversations = 0 linhas, messages = 0 linhas. A memória de conversa é
--     código real e está vazia: nenhum número jamais foi conectado.
--
-- ── Por que presença viva é um sinal NOVO, e não substitui a bandeira ───────
--
-- `lib/distribution/hierarchical-cascade.ts` documenta a escolha de NÃO exigir
-- presença online para distribuir: "a distribuição precisa funcionar offline".
-- Está certo — lead que chega às 2h da manhã precisa de dono às 2h da manhã.
--
-- Então `availability_status` continua sendo a bandeira de quem ACEITA lead, e
-- `last_seen_at` passa a responder outra pergunta: quem está na mesa agora.
-- Duas perguntas diferentes, dois campos.
--
-- Incremental e reversível. Nenhum dado é apagado.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Presença viva ────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists last_seen_at timestamptz;

comment on column public.profiles.last_seen_at is
  'Último batimento de presença (heartbeat da aba aberta). NULL = nunca visto. Não confundir com availability_status, que é a bandeira de aceitar lead e vale mesmo com a aba fechada.';

-- Consulta típica: "quem está online agora nesta organização".
create index if not exists idx_profiles_presenca_viva
  on public.profiles (organization_id, last_seen_at desc)
  where last_seen_at is not null;

-- ── 2. Sessão de WhatsApp por corretor ──────────────────────────────────────
--
-- ATENÇÃO — decisão de negócio tomada pelo dono do produto, com o risco posto:
-- a conexão é feita pela leitura de QR Code no número REAL do corretor, por
-- biblioteca não oficial. Isso contraria os termos do WhatsApp e existe risco
-- de banimento do número pessoal. Foi escolhido conscientemente por manter o
-- aplicativo funcionando no celular do corretor, o que os caminhos oficiais
-- não permitem (migrar para a Cloud API remove o número do app).
--
-- ── O que esta tabela NÃO guarda ────────────────────────────────────────────
--
-- As credenciais de sessão do WhatsApp NÃO ficam aqui e NÃO ficam no banco.
-- Elas dão acesso total à conta e vivem apenas no disco do servidor, em
-- ATLAS_WHATSAPP_SESSION_DIR, fora do repositório. Aqui fica só o ESTADO:
-- conectado ou não, desde quando, qual número (mascarado na interface).

create table if not exists public.whatsapp_broker_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  profile_id uuid not null,

  -- desconectado → aguardando_qr → conectado ; falhou/banido são terminais
  status text not null default 'desconectado'
    check (status in ('desconectado', 'aguardando_qr', 'conectado', 'falhou', 'banido')),

  -- E.164 sem o '+' (5511999998888). Preenchido só depois que o WhatsApp
  -- confirma quem conectou — nunca digitado pelo corretor, para não haver
  -- divergência entre o que ele diz e o número que de fato está na ponta.
  phone_e164 text,

  -- Diagnóstico legível: por que caiu, o que fazer. Nunca contém credencial.
  last_error text,

  connected_at timestamptz,
  disconnected_at timestamptz,
  last_activity_at timestamptz,

  -- Quantas vezes a sessão caiu sozinha. Vários em sequência é sinal de que o
  -- WhatsApp está recusando — motivo para parar de tentar, não para insistir.
  reconnect_count integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Um corretor, uma sessão. Duas sessões para o mesmo número brigariam pelo
-- socket e derrubariam as duas.
create unique index if not exists uq_whatsapp_sessao_por_corretor
  on public.whatsapp_broker_sessions (profile_id);

create index if not exists idx_whatsapp_sessao_org_status
  on public.whatsapp_broker_sessions (organization_id, status);

alter table public.whatsapp_broker_sessions enable row level security;

-- O corretor enxerga e mexe só na própria sessão.
drop policy if exists whatsapp_sessao_propria on public.whatsapp_broker_sessions;
create policy whatsapp_sessao_propria
  on public.whatsapp_broker_sessions
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- A liderança enxerga as sessões da própria organização (para saber quem está
-- conectado), mas não altera a de ninguém — desconectar é ato do dono do
-- número.
drop policy if exists whatsapp_sessao_leitura_da_lideranca on public.whatsapp_broker_sessions;
create policy whatsapp_sessao_leitura_da_lideranca
  on public.whatsapp_broker_sessions
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = whatsapp_broker_sessions.organization_id
        and (p.role = 'admin' or p.commercial_role in ('director', 'superintendent', 'manager'))
    )
  );

comment on table public.whatsapp_broker_sessions is
  'Estado da conexão de WhatsApp de cada corretor. NUNCA guarda credencial de sessão — essas ficam em disco, em ATLAS_WHATSAPP_SESSION_DIR, fora do repositório.';
