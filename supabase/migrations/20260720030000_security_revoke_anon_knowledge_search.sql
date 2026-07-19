-- Correção de segurança (Supabase advisor 0028/0029):
-- A função public.search_knowledge_chunks é SECURITY DEFINER e estava executável
-- pelo papel "anon" (não autenticado) via /rest/v1/rpc — o que permitiria a um
-- visitante não logado consultar trechos da base de conhecimento, ignorando RLS.
-- Revoga o EXECUTE de anon; usuários autenticados (corretores) continuam usando a
-- busca de conhecimento normalmente. Aditivo e reversível.
revoke execute on function public.search_knowledge_chunks(text, uuid, integer) from anon;

-- Nota: a função permanece SECURITY DEFINER para o papel authenticated (a busca
-- vetorial precisa do owner). Se no futuro a busca puder rodar sob RLS do chamador,
-- avaliar migrar para SECURITY INVOKER (advisor recomenda), mas isso exige revisar
-- as policies de knowledge_chunks/knowledge_documents.
