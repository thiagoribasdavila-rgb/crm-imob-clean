# ATLAS ONE — Fase 359: ensaio local descartável das migrations

## Objetivo

Provar que o catálogo SQL do Atlas consegue provisionar PostgreSQL 17 em uma
pilha Supabase local, sem vínculo com o projeto de homologação e sem expor
segredos. O ensaio não altera o administrador, a organização ou qualquer dado
operacional.

## Bloqueio identificado

O catálogo possui 133 arquivos e três timestamps duplicados:

- `20260716235900`;
- `20260717203000`;
- `20260717213000`.

Renomear esses arquivos na base canônica sem reconciliar o histórico remoto
seria inseguro. Por isso, o executor ajusta somente a segunda ocorrência de
cada par dentro da cópia temporária. A fonte permanece intacta.

## Controles do executor

- cria workspace sob o diretório temporário do sistema;
- exclui `.env*`, chaves, certificados, artefatos e arquivos ZIP;
- remove variáveis Supabase/Postgres do processo filho;
- proíbe `--linked`, `--db-url`, `push`, `pull` e `repair`;
- executa apenas `start`, `db reset --local`, `migration list --local` e
  `db lint --local`;
- exclui somente `analytics` e `vector` da pilha descartável, porque o socket
  do Colima não pode ser montado pelo coletor de telemetria; banco, Auth, API,
  Storage e Realtime continuam no ensaio;
- injeta `staging_clone` somente na cópia temporária da migration protegida,
  mantendo intactos o arquivo canônico e o bloqueio de produção;
- não imprime URLs, JWTs ou linhas com segredos;
- encerra os contêineres e apaga a cópia ao final.

## Comandos

- `npm run atlas:phase359:assess` — avalia sem executar SQL;
- `npm run atlas:phase359:execute` — executa o ensaio descartável;
- `npm run atlas:phase359:check` — valida os fail-closed e a normalização.

## Critério de avanço

Somente um ensaio `passed` comprova a aplicação integral das migrations. A
prova dinâmica de RLS da fase 8 continua separada e exige uma restauração
sanitizada, com duas organizações e a hierarquia comercial mínima. Este ensaio
não cria fixtures e não autoriza ZIP, build ou deploy.

## Resultado comprovado

O ensaio foi executado em 9 de agosto de 2026 e terminou como `passed`:

- 133 migrations aplicadas desde uma base vazia;
- `supabase start --exclude analytics,vector` aprovado;
- `supabase db reset --local --no-seed` aprovado;
- catálogo local de migrations conferido;
- `supabase db lint --local --level error --fail-on error` aprovado sem achados;
- nenhum projeto remoto vinculado;
- nenhum banco operacional alterado;
- nenhum segredo exposto.

A evidência sanitizada está em
`artifacts/runtime/atlas-phase-359-local-migration-rehearsal.json`.

Os contratos complementares também foram revalidados:

- revisão de funções privilegiadas da fase 356: 9/9;
- contrato RLS: 7 superfícies críticas, 5 dimensões e 3 tabelas internas;
- grants explícitos Supabase: 61/61;
- segurança das APIs: 168 rotas classificadas;
- contrato estático da fase 359: 6/6;
- auditoria offline de dependências de produção: 0 vulnerabilidades.

Dois verificadores históricos foram alinhados ao estado canônico sem reduzir
segurança: o RPC de projetos usa `public.current_organization_id()` e a tabela
temporária `user_provisioning_failures` deixou de ser exigida após sua remoção
explícita por migration posterior.
