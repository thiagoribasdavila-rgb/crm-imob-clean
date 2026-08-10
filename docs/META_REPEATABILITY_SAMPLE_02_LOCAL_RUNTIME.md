# ATLAS AI OS — Fase 30/100

## Objetivo

Preparar um banco Supabase/Postgres **local, descartável e isolado** para ensaiar a migration oficial do ledger de permissões do segundo evento sintético. A fase valida estrutura, índices, RLS, privilégios e rollback sem reservar permissão e sem enviar evento ao Meta.

## Resultado desta fase

- ambiente Docker Compose limitado a `127.0.0.1:55432`;
- imagem fixada em `supabase/postgres:15.14.1.149`;
- contrato mínimo sem leads, clientes ou credenciais reais;
- três índices de apoio às chaves estrangeiras incluídos antes da primeira execução;
- ensaio automatizado com aplicação, verificação, rollback e destruição do volume;
- workflow manual preparado para um executor isolado;
- banco/produção/Meta: **não tocados**;
- build: **não executado**.

## Estado real

O computador atual não possui Docker, Podman, Colima, OrbStack ou `psql`. Por isso o ensaio não foi executado e nenhum gate operacional foi aprovado. O pacote falha fechado quando o runtime ou a aprovação exata não estão presentes.

## Execução autorizada

Somente em máquina com Docker Compose, dentro da raiz do projeto:

```bash
ATLAS_PHASE30_HUMAN_APPROVAL=EXECUTE_PHASE30_LOCAL_EPHEMERAL_ONLY \
npm run meta:phase-030:rehearsal
```

O comando:

1. remove apenas um eventual volume anterior chamado pelo Compose da Fase 30;
2. cria o Postgres local;
3. aplica o contrato mínimo;
4. aplica a migration oficial com a trava `staging_clone`;
5. verifica objetos, índices, RLS e privilégios;
6. confirma que nenhuma reserva foi criada;
7. executa o rollback seguro;
8. confirma a remoção dos objetos;
9. destrói containers, rede e volume no bloco `finally`;
10. grava evidência sem URL, senha ou dados pessoais.

## Ações explicitamente proibidas

- conectar projeto Supabase remoto;
- usar `db push`, `link` ou banco de produção;
- reservar, emitir ou consumir permissão;
- enviar evento real ou de teste ao Meta;
- alterar campanha, orçamento ou público;
- fazer deploy ou build.

## Referências oficiais verificadas em 19/07/2026

- [Supabase Local Development](https://supabase.com/docs/guides/local-development)
- [Supabase CLI — Getting Started](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Database testing and linting](https://supabase.com/docs/guides/local-development/cli/testing-and-linting)
- [Supabase Postgres images](https://hub.docker.com/r/supabase/postgres/tags)

## Próximo gate

A Fase 31 só pode registrar o ensaio como aprovado depois de obter evidência positiva de migration, segurança, rollback e destruição do volume. A ausência de Docker continua aparecendo como bloqueio, nunca como sucesso presumido.
