# ATLAS AI OS — Fase 16/24

## Ensaio local governado da migration

Esta fase fecha o contrato entre um pacote aprovado e um ensaio reproduzível. Ela não autoriza homologação, produção ou qualquer projeto Supabase vinculado.

## Resultado seguro de hoje

O ensaio não começou. Faltam:

1. manifesto aprovado da Fase 15;
2. migration criada pelo Supabase CLI;
3. teste pgTAP transacional;
4. revisão humana vinculada por SHA-256;
5. permit de uso único válido por até 60 minutos;
6. `supabase/config.toml` para um projeto local reproduzível.

Sem todos esses itens, o avaliador termina antes de iniciar o banco local ou criar evidência de execução.

## Fluxo protegido

```text
manifesto F15
      ↓ hash
migration + teste pgTAP
      ↓ revisão humana
permit de uso único
      ↓ 49 gates
PostgreSQL 17 local
      ↓
reset + teste + lint + advisors
      ↓
reset + teste novamente
      ↓
dossiê sanitizado para decisão
```

O permit local não autoriza homologação nem produção.

## Por que PostgreSQL 17

O ambiente local precisa reproduzir a versão alvo. O Supabase passou a usar PostgreSQL 17 como padrão para novos projetos e documenta diferenças relevantes em relação a versões anteriores. O ensaio comprova a versão no próprio teste, sem inferir pelo nome do ambiente.

## Sequência aprovada

Depois que todos os gates existirem e forem aprovados:

1. reset local sem seed;
2. conferência do histórico local de migrations;
3. teste pgTAP do lote aprovado;
4. lint do banco;
5. advisor de segurança;
6. advisor de desempenho;
7. comparação do delta de catálogo com a allowlist;
8. reset e teste uma segunda vez.

O ensaio precisa passar duas vezes para demonstrar reprodutibilidade e idempotência operacional.

## Controles obrigatórios

- Apenas comandos com `--local`.
- Sem `--linked`, `--db-url`, `db push`, `db pull` ou `migration repair`.
- Uma migration e um lote por ensaio.
- Migration com transação, `lock_timeout`, `statement_timeout`, precondições e pós-condições.
- Nenhuma leitura ou alteração de linhas comerciais ou `auth.users`.
- Fixtures somente sintéticas, locais e sempre descartadas com `ROLLBACK`.
- RLS e grants verificados separadamente.
- UPDATE com SELECT aplicável, `USING` e `WITH CHECK`.
- Views com `security_invoker` ou fora da superfície da API.
- Funções `SECURITY DEFINER` com `search_path` fixo e `EXECUTE` mínimo.
- Sem autorização baseada em `user_metadata` ou `auth.role()`.
- Sem saída bruta, URL do banco, IDs de fixture ou segredos na evidência.

## Por que o config local é obrigatório

O `supabase/config.toml` agora fornece ao CLI um contrato local versionado para
serviços, portas e PostgreSQL 17. Sua criação foi explícita, autorizada e
auditada. Isso não inicia a stack nem autoriza migration: runtime, `psql`,
manifesto, permit e revisão continuam sendo gates independentes.

## Comandos seguros desta fase

```bash
npm run atlas:migration-rehearsal:assess
npm run atlas:migration-rehearsal:check
```

Esses comandos avaliam somente arquivos locais e contratos sintéticos. Eles não iniciam Supabase, não aplicam migration e não consultam dados.

## Referências oficiais

- [Database migrations](https://supabase.com/docs/guides/local-development/database-migrations)
- [Local development with the Supabase CLI](https://supabase.com/docs/guides/local-development)
- [Testing your database](https://supabase.com/docs/guides/local-development/testing/overview)
- [Database linting](https://supabase.com/docs/guides/database/database-linter)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [PostgreSQL 15 to 17 breaking changes](https://supabase.com/docs/guides/troubleshooting/postgres-15-to-17-breaking-changes)

## Próxima decisão

Somente depois de um ensaio local aprovado e repetível a Fase 17 poderá montar o dossiê de promoção. Essa próxima fase continuará sem aplicar DDL remoto automaticamente.
