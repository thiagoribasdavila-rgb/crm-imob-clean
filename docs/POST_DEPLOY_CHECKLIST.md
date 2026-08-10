# ATLAS V3 — checklist pós-deploy

## Regra principal: DDL antes do código

Antes de subir um novo ZIP, reiniciar a aplicação ou validar qualquer tela em homologação/produção, aplique primeiro as migrations pendentes do Supabase.

Motivo: o código do ATLAS V3 já espera estruturas novas do banco. Se a aplicação for publicada antes da DDL, módulos que registram eventos podem falhar mesmo com login e interface funcionando.

Caso conhecido:

- erro observado: `event_ingest_failed`;
- rota afetada: `POST /api/v3/events/ingest`;
- causa provável quando a base está desatualizada: tabela `public.atlas_events` ausente ou schema cache ainda sem a tabela;
- migration responsável: `supabase/migrations/20260711150000_atlas_v3_unification.sql`.

Essa migration cria:

- `public.atlas_events`;
- índices de consulta por organização/tipo/data;
- RLS da tabela;
- estruturas base do AI OS: decisões, execuções de agentes e digital twins.

## Ordem segura de implantação

1. Fazer backup/snapshot do Supabase antes de qualquer alteração.
2. Confirmar que o deploy aponta para o projeto Supabase correto.
3. Aplicar todas as migrations pendentes.
4. Validar a existência das tabelas críticas.
5. Somente depois subir o ZIP novo na Hostinger.
6. Instalar dependências e reiniciar o processo.
7. Rodar os testes de fumaça.
8. Validar no navegador com usuários reais.

## Verificações mínimas após aplicar DDL

Execute no SQL Editor do Supabase:

```sql
select to_regclass('public.atlas_events') as atlas_events_table;
```

Resultado esperado:

```text
public.atlas_events
```

Confira também as colunas:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'atlas_events'
order by ordinal_position;
```

Colunas esperadas:

- `id`;
- `organization_id`;
- `event_type`;
- `source`;
- `aggregate_type`;
- `aggregate_id`;
- `payload`;
- `correlation_id`;
- `causation_id`;
- `occurred_at`;
- `processed_at`.

## Validação do erro `event_ingest_failed`

Depois da DDL, o erro `event_ingest_failed` deve desaparecer se a causa era ausência da tabela `atlas_events`.

Se o erro continuar, verificar nesta ordem:

1. `SUPABASE_SERVICE_ROLE_KEY` no servidor;
2. `ATLAS_CRON_SECRET` ou token usado pela rota protegida;
3. `organization_id` resolvido pela identidade da API;
4. políticas RLS e função `current_organization_id()`;
5. schema cache do Supabase;
6. logs da aplicação na Hostinger.

## Ordem de smoke test após subir o ZIP

Validar:

- login;
- Command Center;
- Leads;
- Pipeline/Kanban;
- Clientes 360;
- Projetos;
- Agenda;
- Reativação;
- Copilot;
- ingestão de evento;
- relatório executivo.

Critério de aceite:

- nenhuma tela crítica mostra erro técnico;
- dados reais aparecem nos módulos principais;
- `atlas_events` recebe novos registros;
- o usuário consegue trabalhar sem travar o fluxo.

## Observação importante

Não corrigir o código para “contornar” ausência de DDL quando a estrutura correta já existe em migration. Primeiro alinhe o banco. Só depois investigue código.
