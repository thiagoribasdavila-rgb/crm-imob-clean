# ATLAS ONE V3000 — Fase 381

## Objetivo

Provar os contratos de runtime de autenticação, organização, autorização e isolamento sem alterar o Supabase, os usuários ou a operação real.

## Resultado

- Fronteira anônima online comprovada em `https://atlasaios.com.br`:
  - `/login`: público e disponível;
  - `/setup`: público e disponível;
  - `/dashboard`: exige sessão e preserva o destino em `next`;
  - `/api/v1/auth/me`: rejeita acesso anônimo com `UNAUTHENTICATED`.
- Contratos estáticos comprovados:
  - sessão validada com `auth.getUser`;
  - perfil ativo obrigatório;
  - organização ativa obrigatória;
  - fallback de organização limitado à homologação;
  - papéis e escopo comercial validados;
  - leitura de lead limitada por `organization_id`;
  - arquivos reais de ambiente não versionados.
- Auditorias de RLS aprovadas em modo estático.

## Limite da prova

A sessão autenticada não foi reproduzida por script porque o executor não possui credencial segura no worktree e o runtime de automação do navegador não iniciou. Nenhum cookie, senha, token ou chave de serviço foi copiado como atalho.

Por isso, permanecem pendentes:

1. sessão autenticada resolvendo o perfil;
2. perfil resolvendo a organização ativa;
3. papel carregado do perfil;
4. leitura tenant-safe de dados reais;
5. negação dinâmica cross-tenant.

## Segurança

- alteração remota: **não**;
- bootstrap: **não**;
- migration aplicada: **não**;
- usuário ou organização alterados: **não**;
- segredo registrado: **não**;
- ZIP criado: **não**.

## Estado do gate

O gate 8/16 está **em andamento**. A fase histórica 381 está concluída, mas o gate somente poderá ser promovido depois das cinco provas autenticadas acima.
