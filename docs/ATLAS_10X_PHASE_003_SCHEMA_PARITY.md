# ATLAS AI OS — Fase 3/24

## Paridade de ambientes e schema remoto

### Objetivo

Impedir que o Atlas trate o projeto legado e o novo V3 como se fossem o mesmo
ambiente. A auditoria desta fase foi somente leitura e comparou:

- os arquivos em `supabase/migrations`;
- o histórico remoto de migrations;
- as tabelas públicas e sua cobertura de RLS;
- os contratos mínimos usados pelo CRM;
- a existência de tenant e dados operacionais.

### Ambientes identificados no snapshot histórico

| Papel | Projeto | Região | Migrations | Tabelas | Linhas estimadas |
|---|---|---:|---:|---:|---:|
| Legado com dados | `atlas-ai-crm-v1` | `us-west-2` | 33 | 23 | 18.003 |
| V3 homologação | `atlas-v3-homologacao` | `sa-east-1` | 179 | 177 | 145 |

O legado ainda concentra 17151 leads, cinco perfis, três projetos e duas
organizações. O snapshot de 23/07 registrava o V3 sem organizações, perfis,
leads, tarefas, projetos, empreendimentos e oportunidades.

Essa leitura é **histórica**. Depois dela, o primeiro administrador e a
organização Atlas One foram criados e validados pelo usuário. Como este
workspace está sem URL, chave de serviço e conexão de banco locais, não há
autorização técnica para substituir aquele snapshot por uma afirmação não
verificada. A auditoria passa a exigir evidência com no máximo um dia de idade.

Ter muitas tabelas não é paridade operacional. O V3 possui 177 tabelas com RLS
habilitado, mas ainda não possui o tenant e a base comercial necessários para
um login real operar.

### Drift de migrations

O diretório local possui:

- 124 arquivos SQL;
- 121 versões únicas;
- três timestamps usados por mais de um arquivo.

O histórico remoto do V3 possui:

- 179 registros;
- 144 nomes lógicos distintos;
- 30 nomes lógicos reaplicados.

Após normalizar o timestamp dos nomes, 122 migrations locais têm correspondente
remoto. Duas migrations locais não aparecem logicamente no remoto:

- `add_missing_foreign_key_indexes`;
- `phase_029_meta_permit_atomic_ledger`.

O remoto também contém 22 migrations lógicas que não existem no diretório
local. Por isso, renomear arquivos, executar `migration repair` ou aplicar o
diretório atual diretamente poderia esconder o drift ou duplicar mudanças.

### Contratos existentes

As superfícies centrais existem no V3:

- organizações e perfis;
- leads, tarefas e projetos;
- empreendimentos e oportunidades;
- `atlas_events`;
- eventos de conversão e execuções Meta.

Os contratos compatíveis observados incluem `profiles.name/full_name`,
`leads.score/score_ia` e `tasks.due_date`. O runtime deve continuar usando os
adapters versionados para expor nome, score e `due_at` sem exigir alteração
destrutiva.

### Evidência de segurança

As 177 tabelas públicas retornadas pelo inventário remoto estão com RLS
habilitado. A sessão não recebeu autorização para a consulta agregada de
policies, grants e funções `SECURITY DEFINER`; portanto esses três itens
continuam não comprovados e bloqueiam a aprovação final.

RLS e privilégios de tabela são controles separados. A aprovação futura exige
evidência explícita dos dois.

### Próxima correção segura

1. Produzir leitura somente leitura atual do projeto `atlas-v3-homologacao`.
2. Confirmar, sem expor dados pessoais, a existência do administrador e da
   organização recém-criados.
3. Reconstruir uma linha do tempo canônica das 179 aplicações remotas.
4. Resolver as três colisões de versão em um branch/ambiente descartável.
5. Reproduzir o schema do zero em ambiente isolado.
6. Comparar tabelas, constraints, policies, grants e funções.
7. Preparar um ensaio separado de migração dos dados do legado.

Nenhuma migration foi aplicada, reparada ou removida nesta fase.

### Referências oficiais

- [Supabase — Database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Supabase CLI — migration list](https://supabase.com/docs/reference/cli/supabase-migration-list)
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — grants explícitos na Data API](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)

### Política de entrega

Nenhum build ou ZIP é criado nesta fase. Eles continuam reservados ao
fechamento do pacote de release.

### Próxima fase

Fase 4/24 — Identidade de ambiente, tenant e RBAC remoto.
