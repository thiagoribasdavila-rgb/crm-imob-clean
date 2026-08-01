-- public.search_knowledge_chunks(text, uuid, integer) — o segundo objeto fantasma.
--
-- Mesmo padrão do private.can_view_lead: a migration 20260720030000_security_revoke_anon_knowledge_search
-- executa `revoke execute on function public.search_knowledge_chunks(text, uuid, integer) from anon`
-- sobre uma função que NENHUMA migration do repositório cria. Verificado por git grep: duas migrations
-- a mencionam, zero a definem. Em produção ela existe (foi criada fora do histórico versionado, como o
-- resto do schema-base); numa reconstrução do zero o revoke aborta e leva a migration inteira junto.
--
-- Diferença importante em relação ao can_view_lead: o código da aplicação NÃO a chama nenhuma vez
-- (git grep search_knowledge_chunks em lib/ e app/ = 0). Ou seja, nada de produto depende dela hoje —
-- ela existe para que a cadeia de migrations seja reconstruível e para que o revoke de segurança tenha
-- alvo. Por isso a implementação é deliberadamente conservadora: busca textual sobre o material já
-- indexado, escopada por organização, sem inventar comportamento que ninguém especificou.
--
-- ESCOPO DE TENANT. O filtro por organization_id é obrigatório e vem por parâmetro, não do JWT: a função
-- é security definer e será chamada por rotinas de servidor. Quem chama é responsável por passar a
-- organização correta — o mesmo contrato das demais RPCs deste repo.
--
-- CONFIGURAÇÃO DE BUSCA. 'portuguese' explicitamente qualificada como pg_catalog.portuguese: com
-- `set search_path = ''` a resolução de regconfig por nome curto falharia. É a mesma configuração usada
-- na coluna gerada knowledge_chunks.search_vector, então índice e consulta falam a mesma língua.

create or replace function public.search_knowledge_chunks(
  p_query text,
  p_organization_id uuid,
  p_limit integer default 10
)
returns table (
  id uuid,
  document_id uuid,
  project_id uuid,
  chunk_index integer,
  content text,
  metadata jsonb,
  rank real
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.document_id,
    c.project_id,
    c.chunk_index,
    c.content,
    c.metadata,
    ts_rank(c.search_vector, websearch_to_tsquery('pg_catalog.portuguese'::regconfig, p_query)) as rank
  from public.knowledge_chunks c
  where c.organization_id = p_organization_id
    and p_query is not null
    and btrim(p_query) <> ''
    and c.search_vector @@ websearch_to_tsquery('pg_catalog.portuguese'::regconfig, p_query)
  order by rank desc, c.chunk_index
  -- Teto rígido: um limite ausente ou absurdo não deve virar varredura da base inteira.
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

revoke all on function public.search_knowledge_chunks(text, uuid, integer) from public, anon;
grant execute on function public.search_knowledge_chunks(text, uuid, integer) to authenticated, service_role;
