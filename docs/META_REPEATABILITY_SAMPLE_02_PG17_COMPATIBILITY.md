# ATLAS AI OS — Fase 32/100

## Objetivo

Preparar um segundo ensaio local e efêmero do ledger Meta da amostra 02 usando PostgreSQL 17, sem substituir nem alterar a referência PostgreSQL 15 das Fases 30 e 31.

## Problema resolvido

O Supabase alterou em junho de 2026 o PostgreSQL padrão do ambiente self-hosted de 15 para 17. O diretório físico de dados do PostgreSQL 15 não pode ser reutilizado diretamente no PostgreSQL 17. Esta fase evita uma atualização silenciosa e cria uma matriz de compatibilidade separada, reproduzível e destrutível.

## Isolamento obrigatório

O ensaio complementar usa exclusivamente:

- imagem fixada `supabase/postgres:17.6.1.149`;
- endereço local `127.0.0.1:55433`;
- banco novo `atlas_phase32`;
- volume novo `phase32-pg17-postgres-data`;
- usuário proprietário `postgres`;
- destruição do volume ao final, inclusive após falha.

O volume `phase30-postgres-data` nunca é montado, migrado ou reutilizado.

## Cadeia de confiança

A Fase 32 somente pode iniciar depois de validar:

1. a evidência real `phase31.runtime-evidence.v1` produzida pelo ensaio PostgreSQL 15;
2. o recibo `phase31.runtime-reconciliation.v1`;
3. o vínculo criptográfico entre evidência e recibo;
4. os hashes dos artefatos compartilhados: baseline, migration, segurança, rollback e limpeza;
5. a aprovação humana exata `EXECUTE_PHASE32_PG17_LOCAL_EPHEMERAL_ONLY`.

Sem qualquer um desses elementos, o executor falha fechado antes de iniciar o container.

## Compatibilidade verificada

No PostgreSQL 17 o ensaio confirma:

- major real 17;
- contexto proprietário `postgres`;
- extensão necessária `pgcrypto`;
- ausência de `timescaledb`, `plv8`, `plcoffee` e `plls`, listadas pelo Supabase como incompatíveis nesse caminho de atualização;
- criação dos objetos do ledger;
- RLS forçada, privilégios e índices de suporte;
- ledger vazio, sem reserva de permissão;
- rollback integral e destruição do runtime.

## Estado desta fase

- contrato estático PostgreSQL 17: **preparado**;
- 24 testes negativos de preflight: **preparados**;
- evidência real PostgreSQL 15: **não recebida**;
- recibo real da Fase 31: **não recebido**;
- ensaio PostgreSQL 17: **não foi executado**;
- banco remoto/produção/Meta: **não tocados**;
- permissão Meta: **não reservada, emitida ou consumida**;
- build: **não executado**.

Portanto, esta fase não afirma compatibilidade operacional. Ela entrega o mecanismo verificável para comprová-la no workflow manual quando o runtime isolado estiver disponível.

## Segurança aplicada

- nenhum URL de banco é aceito;
- arquivos de origem precisam ser regulares, menores que 1 MiB e internos ao workspace;
- links simbólicos são rejeitados;
- toda ação remota, campanha, evento Meta, deploy e build permanece proibida;
- o executor só registra hashes e metadados sanitizados;
- a migration usa transação curta, `lock_timeout` e `statement_timeout`;
- FKs possuem índices de suporte e as tabelas privadas usam RLS forçada e privilégios mínimos.

## Referências oficiais consultadas em 19/07/2026

- [Mudança self-hosted do PostgreSQL 15 para 17](https://supabase.com/changelog/46080-self-hosted-supabase-upgrading-from-pg-15-to-17-breaking-change)
- [Tags oficiais do Supabase Postgres](https://hub.docker.com/r/supabase/postgres/tags)
- [Desenvolvimento local isolado](https://supabase.com/docs/guides/local-development)
- [Testes e linting local](https://supabase.com/docs/guides/local-development/cli/testing-and-linting)
- [Testes de banco com pgTAP](https://supabase.com/docs/guides/database/testing)
- [Migrations de banco](https://supabase.com/docs/guides/deployment/database-migrations)

## Próxima etapa recomendada

Executar o workflow manual em ambiente com Docker, produzir a evidência PostgreSQL 15, reconciliá-la e somente então executar o ensaio PostgreSQL 17. A Fase 33 deverá validar a nova evidência e comparar os dois majors sem tocar produção ou enviar sinais ao Meta.
