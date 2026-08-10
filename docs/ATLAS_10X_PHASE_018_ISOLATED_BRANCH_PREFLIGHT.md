# ATLAS AI OS — Fase 18/24

## Preflight sanitizado de branch isolada

Esta fase prepara a observação técnica mínima necessária para conferir uma
branch Supabase isolada antes de qualquer plano de remediação. O avaliador
criado nesta fase não conecta no Supabase, não grava arquivo, não executa SQL e
não aplica migration.

O preflight remoto futuro só poderá ocorrer com:

1. dossiê aprovado da Fase 17;
2. descritor sanitizado de branch de homologação isolada;
3. autorização humana opaca, de uso único e com validade máxima de 30 minutos;
4. observação sanitizada vinculada aos três artefatos anteriores por SHA-256.

Sem os quatro itens, a avaliação falha fechado.

## O que poderá ser observado

Somente resumos de metadados:

- alcance e isolamento da branch;
- quantidade de entradas no ledger de migrations;
- contagens de tabelas expostas, com e sem RLS;
- contagens de findings de grants e políticas `UPDATE`;
- contagens de findings de views e funções `SECURITY DEFINER`;
- contagens dos advisors de segurança e performance;
- fingerprints SHA-256 do catálogo, ledger e advisors.

Os checks registram apenas `captured` ou `not_captured`. Findings diferentes de
zero são aceitos como observação, não como aprovação técnica: serão convertidos
em backlog na Fase 19.

## O que continua proibido

- ler linhas comerciais, `auth.users` ou objetos do Storage;
- persistir nomes de objetos, SQL ou saída bruta da CLI;
- registrar project ref, URL, chave ou connection string;
- aplicar DDL, DML, migration, `db push` ou `migration repair`;
- criar, atualizar, pausar, mesclar ou apagar branch;
- tocar produção ou main;
- copiar dados reais;
- executar build ou gerar ZIP.

O contrato distingue explicitamente leitura sanitizada de metadados de qualquer
mutação. A existência de credencial não concede autorização.

## Base técnica confirmada

- Supabase CLI local: `2.109.1`;
- PostgreSQL esperado na branch: major `17`;
- saúde inicial obrigatória: `preflight_pending`;
- saúde sanitizada após observação: `preflight_observed`;
- 54 gates fail-closed;
- 30 mutantes de segurança.

A documentação oficial do Supabase informa que branches possuem banco, API,
Auth e Storage próprios e que migrations novas são aplicadas de forma
sequencial. As regras de RLS também deixam claro que habilitar RLS e conceder
privilégios são controles separados e que `UPDATE` precisa de política
compatível de `SELECT`.

Referências oficiais:

- https://supabase.com/docs/guides/deployment/branching/working-with-branches
- https://supabase.com/docs/guides/deployment/database-migrations
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/changelog/47796-developer-update-july-2026
- https://supabase.com/changelog/46080-self-hosted-supabase-upgrading-from-pg-15-to-17-breaking-change

## Como avaliar localmente

```bash
npm run atlas:branch-preflight:assess
npm run atlas:branch-preflight:check
```

O primeiro comando apenas lê artefatos JSON do workspace e devolve uma decisão
em memória. O segundo verifica contrato, evidência, mutantes e regressão da Fase
17. Nenhum deles executa comando remoto.

## Estado esperado agora

O resultado correto nesta entrega é:

- 6/54 gates atendidos;
- 48 blockers explícitos;
- 30/30 mutantes rejeitados;
- preflight remoto não autorizado;
- observação remota inexistente;
- produção, main, dados reais, build e ZIP intactos.

Este estado não é uma falha do produto. É a prova de que `continuar` não foi
interpretado como autorização para acessar infraestrutura remota.
O preflight remoto não foi executado.

## Saída para a próxima fase

Quando uma observação válida existir, a Fase 19 poderá transformar apenas suas
contagens sanitizadas em um plano de remediação versionado e testável. A Fase 19
continuará sem aplicar migration remota.
