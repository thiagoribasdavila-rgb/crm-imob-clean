-- Correção de segurança em private.current_organization_id().
--
-- A versão anterior (escrita em 20260711030000, ao reconstruir a fundação) dava
-- PRECEDÊNCIA ao claim app_metadata.organization_id do JWT e só caía no perfil quando
-- o claim estava ausente. Um teste adversarial com duas organizações reais em
-- homologação provou três consequências, todas medidas, nenhuma teórica:
--
--  1. VAZAMENTO ENTRE EMPRESAS. O claim nunca era conferido contra o próprio perfil do
--     usuário. Uma sessão autenticada como usuário da org A, portando um claim que
--     aponta para a org B, resolvia org B e LEU dados da org B — marketing_campaigns,
--     knowledge_documents, product_budgets e lead_events. Um usuário comum não forja
--     app_metadata pelo SDK (só a admin API escreve), mas o banco aceitava qualquer
--     valor que chegasse no token, sem verificar.
--
--  2. TRANSFERÊNCIA NÃO REVOGA. Ao mover um perfil da org A para a org B, o token
--     antigo continuava resolvendo a org A e lendo dados dela até expirar (1h no
--     padrão do Supabase). Este caso não exige forja nenhuma: é o comportamento normal
--     durante toda a validade do access token.
--
--  3. DESATIVAÇÃO NÃO REVOGA. A checagem `active = true` existia SOMENTE no caminho do
--     fallback. Com o claim presente ela era pulada, então desativar um usuário não
--     tirava o acesso dele — ele seguia lendo a empresa inteira até o token expirar.
--
-- A correção elimina a precedência do claim: o perfil passa a ser a única fonte de
-- verdade, e a exigência de `active` vale para todo mundo, sem caminho alternativo.
-- Como a função é SECURITY DEFINER, ela lê profiles sem passar pelo RLS da tabela —
-- é o que evita recursão de policy e o que torna esta leitura barata o bastante para
-- ser feita a cada avaliação.
--
-- Custo: uma busca por chave primária a mais por avaliação de policy. Correção de
-- isolamento entre empresas vale esse preço; e o `stable` permite ao planejador
-- reaproveitar o resultado dentro da mesma consulta.
--
-- Nota deliberada: NÃO se conserta isto conferindo o claim contra o perfil. Se o
-- perfil precisa ser lido de qualquer forma para conferir, o claim deixa de economizar
-- qualquer coisa e vira apenas mais uma superfície para errar.

create or replace function private.current_organization_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  org uuid;
begin
  select p.organization_id
    into org
    from public.profiles p
   where p.id = (select auth.uid())
     and coalesce(p.active, false) = true;

  -- Sem perfil, perfil inativo ou sessão anônima: nulo. Policies no formato
  -- organization_id = current_organization_id() não são satisfeitas por nulo,
  -- então o padrão é negar — nunca vazar.
  return org;
end;
$$;

revoke all on function private.current_organization_id() from public, anon;
grant execute on function private.current_organization_id() to authenticated, service_role;
