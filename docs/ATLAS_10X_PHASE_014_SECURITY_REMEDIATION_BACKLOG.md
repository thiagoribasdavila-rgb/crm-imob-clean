# ATLAS AI OS — Fase 14/24

## Backlog seguro de correções da superfície de acesso

### Objetivo

Transformar o inventário canônico da Fase 13 em itens de correção revisáveis, com prioridade, dependências e uma proposta conceitual. Esta fase **não cria nem aplica migrations**.

### Fonte canônica

O gerador aceita somente o snapshot:

`artifacts/runtime/phase-013/execution/access-surface-snapshot.json`

Ele precisa ter sido capturado no clone PostgreSQL 17 isolado, em transação somente leitura, com fingerprint atestado e sem leitura de linhas comerciais.

O histórico local de migrations serve para dimensionar a revisão. Ele **não significa** que uma tabela, policy, view, função ou grant exista hoje no banco efetivo.

### Severidade

| Nível | Significado | Exemplos |
|---|---|---|
| P0 | Pode expor dados, ampliar privilégio ou burlar isolamento | tabela exposta sem RLS, anon em tabela comercial, view insegura, `PUBLIC EXECUTE` |
| P1 | Impede uma implantação segura ou exige endurecimento | UPDATE incompleto, `auth.role()`, `search_path` inseguro, inventário parcial |

Todos os itens nascem com:

- `review_status = unapproved`;
- correção automática desabilitada;
- aprovação humana obrigatória;
- ordem de dependência explícita.

### Ordem de correção

1. conter exposições;
2. corrigir RLS e policies;
3. restaurar grants mínimos;
4. endurecer views;
5. endurecer funções privilegiadas;
6. endurecer privilégios padrão;
7. ensaiar, testar, executar advisors e aprovar.

Essa ordem impede que um grant seja restaurado antes de o isolamento estar comprovado.

### Supabase em 2026

Projetos novos deixaram de expor objetos automaticamente por grants padrão. Por isso, o ATLAS não assume que RLS sozinho concede acesso e não assume que novos objetos já estejam expostos. RLS e grants são verificados separadamente e os grants necessários devem ser mínimos e explícitos.

Referências oficiais:

- [Breaking change: tables not exposed automatically](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
- [Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Database Advisors](https://supabase.com/docs/guides/database/database-advisors)

### Como avaliar

```bash
npm run atlas:security-backlog:assess
npm run atlas:security-backlog:check
```

Sem o snapshot canônico, o resultado correto é bloqueado. `0` achados nesse estado significa apenas que nada foi classificado; não significa banco seguro.

### Propostas SQL

O arquivo `scripts/sql/phase-014-security-remediation-review-template.sql` é totalmente comentado. Ele documenta exemplos conceituais, não um script de implantação.

Quando um item for aprovado futuramente:

1. criar uma migration nova com a CLI Supabase;
2. ensaiar no clone isolado;
3. rodar testes dinâmicos por papel e tenant;
4. executar os advisors;
5. revisar rollback e evidências;
6. obter aprovação humana;
7. somente depois planejar a implantação controlada.

### Restrições desta fase

- não ler banco remoto;
- não consultar usuários Auth;
- não ler dados comerciais;
- não aplicar DDL ou DML;
- não criar migration;
- não tocar na homologação;
- não executar build;
- não criar ZIP.
