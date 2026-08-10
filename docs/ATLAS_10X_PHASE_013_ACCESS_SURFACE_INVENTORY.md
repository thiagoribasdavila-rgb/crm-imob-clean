# ATLAS AI OS — Fase 13/24

## Objetivo

Produzir um inventário verificável da superfície de acesso do banco: tabelas expostas, RLS, grants, privilégios padrão, views, políticas e funções `SECURITY DEFINER`.

## Fonte canônica

A única fonte capaz de aprovar esta fase é um snapshot do catálogo do clone PostgreSQL 17 isolado e autorizado na Fase 12. O histórico local de migrations é útil para encontrar áreas de revisão, mas não comprova o estado efetivo do banco.

## O que a captura pode ler

- metadados de `pg_class`, `pg_policy`, `pg_proc`, `pg_default_acl` e ACLs;
- nomes e assinaturas de objetos;
- presença de `USING`, `WITH CHECK`, `security_invoker` e `search_path`;
- nomes de papéis e tipos de privilégio.

## O que a captura não pode ler ou persistir

- linhas de leads, clientes, usuários, campanhas ou projetos;
- `auth.users`;
- corpos de funções;
- expressões completas de políticas;
- URL ou credenciais do banco;
- saída bruta do `psql`.

## Invariantes avaliadas

1. RLS e grants são controles separados e ambos precisam ser verificados.
2. Toda tabela acessível por `anon` ou `authenticated` precisa ter RLS.
3. Política de `UPDATE` precisa de visibilidade por `SELECT`, `USING` e `WITH CHECK`.
4. View acessível pela API precisa usar `security_invoker`; caso contrário, não pode estar exposta.
5. Função `SECURITY DEFINER` precisa de `search_path` fixo e `EXECUTE` mínimo.
6. Políticas não podem confiar em `user_metadata` nem em `auth.role()`.
7. Tabelas comerciais canônicas não podem conceder privilégio ao papel `anon`.
8. Privilégios padrão não podem reabrir objetos futuros para `public`, `anon` ou `authenticated`.

## Execução futura

Somente após a Fase 12 estar aceita, o operador autorizado poderá executar a consulta de catálogo em transação somente leitura contra o clone em loopback. O arquivo SQL termina em `ROLLBACK` e não consulta tabelas da aplicação.

Não executar esta consulta contra homologação, produção, projeto linked ou endereço remoto.

## Referências oficiais

- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- [Tables and Data](https://supabase.com/docs/guides/database/tables)
- [Mudança de grants padrão em 2026](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)

## Comandos locais

```bash
npm run atlas:access-surface:assess
npm run atlas:access-surface:check
```

Esses comandos não consultam o Supabase remoto, não aplicam SQL e não geram build ou ZIP.
