-- ============================================================================
-- CONSENTIMENTO: CONTAR EXATAMENTE COMO O TRABALHADOR NOTURNO LÊ
--
-- ATENÇÃO: esta migration foi ESCRITA e NÃO FOI APLICADA. Ela é pré-requisito
-- do painel /api/v1/ai/prontidao-para-ligar. Enquanto não for aplicada, o
-- painel reporta o item de consentimento como `nao_medido` — com o motivo
-- escrito — e NUNCA como zero. Ausência de função não pode virar ausência de
-- consentimento.
--
-- ── POR QUE UMA FUNÇÃO, E NÃO UM FILTRO NA ROTA ─────────────────────────────
--
-- O predicado do trabalhador noturno, em
-- `app/api/v2/ai/nightly-sales/route.ts`, é uma disjunção com um ramo
-- condicional:
--
--     consentBasis = reactivation.consentBasis
--                 || (messagingConsent.whatsapp === true ? messagingConsent.basis : "")
--     if (!consentBasis.trim()) { blocked += 1; continue; }
--
-- Reescrever isso como filtro PostgREST na rota criaria uma SEGUNDA versão do
-- mesmo predicado. É precisamente a classe de defeito que este painel existe
-- para denunciar: duas leituras do mesmo fato que divergem em silêncio, e a
-- tela dizendo "pronto" sobre um portão que continua fechado.
--
-- Aqui o predicado tem UMA definição em SQL, e o comentário aponta a linha que
-- ela espelha. Quando o código mudar, este arquivo precisa mudar junto — e a
-- divergência fica visível numa revisão em vez de virar um número errado.
--
-- ── AS DUAS FUNÇÕES SÃO DE PROPÓSITO DIFERENTES ─────────────────────────────
--
-- `count_leads_com_consentimento_do_worker`  → o que o motor CONSEGUE usar.
-- `count_leads_com_consentimento_declarado`  → o que a operação JÁ COLETOU.
--
-- Medido no banco de produção em 02/08/2026, na organização Atlas One:
--
--     legível pelo trabalhador ......   0 de 490
--     declarado na entrada .......... 204 de 490   (metadata.meta.consentBasis)
--
-- Os dois números juntos dizem algo que nenhum deles diz sozinho: o
-- consentimento EXISTE para 204 leads e o motor não o enxerga, porque a entrada
-- da Meta grava em `metadata.meta.consentBasis` e o trabalhador lê
-- `metadata.reactivation.consentBasis`. Sem o contraste, o painel mandaria a
-- operação coletar de novo algo que já está coletado.
--
-- Nenhuma das duas escreve. São STABLE, sem efeito colateral.
-- ============================================================================

-- O predicado do trabalhador noturno, espelhado. `nullif(btrim(...),'')` é o
-- `.trim()` do JavaScript: string vazia não é consentimento, e tratá-la como
-- consentimento liberaria envio para quem nunca autorizou.
create or replace function public.count_leads_com_consentimento_do_worker(
  p_organization_id uuid
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from leads
  where organization_id = p_organization_id
    and coalesce(
          nullif(btrim(metadata -> 'reactivation' ->> 'consentBasis'), ''),
          case
            when metadata -> 'messagingConsent' ->> 'whatsapp' = 'true'
              then nullif(btrim(metadata -> 'messagingConsent' ->> 'basis'), '')
          end
        ) is not null;
$$;

comment on function public.count_leads_com_consentimento_do_worker(uuid) is
  'Leads cuja base de consentimento o trabalhador noturno CONSEGUE ler. Espelha o predicado de app/api/v2/ai/nightly-sales/route.ts. Mudou lá, muda aqui.';

-- O que a operação já coletou, na chave que a entrada da Meta realmente grava
-- (`app/api/v2/outbox/process/route.ts` copia `meta_lead_sources.consent_basis`
-- para `metadata.meta.consentBasis`).
create or replace function public.count_leads_com_consentimento_declarado(
  p_organization_id uuid
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from leads
  where organization_id = p_organization_id
    and nullif(btrim(metadata -> 'meta' ->> 'consentBasis'), '') is not null;
$$;

comment on function public.count_leads_com_consentimento_declarado(uuid) is
  'Leads com base de consentimento declarada na entrada (metadata.meta.consentBasis). Comparar com count_leads_com_consentimento_do_worker revela consentimento coletado que o motor não enxerga.';

-- `service_role` apenas: a rota que consome estas funções já confere papel e
-- passa a organização do contexto de acesso verificado. Conceder a
-- `authenticated` abriria contagem por organização arbitrária a qualquer
-- sessão, porque o parâmetro é um uuid livre.
revoke all on function public.count_leads_com_consentimento_do_worker(uuid) from public, anon, authenticated;
revoke all on function public.count_leads_com_consentimento_declarado(uuid) from public, anon, authenticated;
grant execute on function public.count_leads_com_consentimento_do_worker(uuid) to service_role;
grant execute on function public.count_leads_com_consentimento_declarado(uuid) to service_role;
