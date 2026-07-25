# CAPACIDADES DESCONECTADAS — pronto no banco, desligado no código

Varredura de 2026-07-24 no projeto `atlas-v3-homologacao`. O método foi cruzar as
**104 funções** do schema `public` com quem as chama em `app/`, `lib/` e `core/`.

Este é o padrão dominante do projeto: a capacidade foi construída no banco, a migration
subiu, e o código nunca foi ligado nela. Não é dívida de implementação — é dívida de **fiação**.

## Já acopladas nesta sessão

| RPC | onde | resultado |
|---|---|---|
| `create_recurring_task` | `POST /api/v1/tasks` | recorrência saiu do 503 |
| (cancelamento por `active=false`) | `PATCH /api/v1/tasks` | botão "Encerrar repetição" deixou de dar 400 |
| `redistribute_absent_broker_leads` | `POST /api/v1/crm/distribution` | cobertura por ausência |
| `configure_broker_capacity` | idem | limite de carteira |
| `configure_distribution_priority` | idem | prioridade da fila |
| `distribute_project_leads_v4` | idem | motor que **honra** prioridade e capacidade |
| `accept_lead_assignment` | idem | aceite da reserva pelo corretor |
| `get_portfolio_audit_ledger` | `GET /api/v1/crm/distribution` | extrato deixou de ser zero fixo |

## Acopladas na segunda rodada

| RPC | onde | ganho real |
|---|---|---|
| `move_pipeline_lead` | `PATCH /api/v1/pipeline` | etapa + histórico na mesma transação. A escrita compensatória podia deixar a lead numa etapa que o histórico não conhece, se o próprio desfazer falhasse. |
| `manage_commercial_profile` | `PATCH /api/v1/team` | hierarquia validada no banco + rastro em `profile_hierarchy_events`. Antes aceitava qualquer supervisor, sem registro. |
| `process_expired_lead_reservations` | `POST /api/v2/crm/reservations/process` | devolve à fila a reserva não aceita. Sem ele, "aceite em 5 minutos" não significava nada. |

## NÃO acopladas — com motivo verificado, não por falta de tempo

### `create_lead_atomic` — **acoplar quebraria a listagem de leads**

Parecia a mais barata da lista. Não é. O corpo da função grava nas colunas
**canônicas V3**:

```
development_id, assigned_to, bedrooms, preferred_regions, score
```

...enquanto o resto da aplicação lê as **legadas**, via `LIVE_LEAD_SELECT` e `mapLegacyLead`:

```
project_id, assigned_user_id, preferred_bedrooms, preferred_neighborhoods, score_ia
```

Lead criada pela RPC teria `assigned_user_id` NULL. Toda tela que filtra por essa coluna —
pipeline, carteira do corretor, distribuição — **não a enxergaria**. É exatamente a classe de
bug já registrada: `register_lead` grava `assigned_to` e nada sincroniza `assigned_user_id`.

**Para desbloquear:** ou um trigger de sincronização entre as duas grafias, ou a migração das
leituras para as colunas canônicas. Os dois são decisão de arquitetura, não fiação.

### `mutate_crm_project_v1` e `version_project_material` — não há rota para acoplar

Nenhuma rota escreve `crm_projects` nem versiona material hoje. Ligar essas RPCs significaria
**criar endpoint e tela novos**, o que é funcionalidade nova, não acoplamento. Fora do escopo
desta varredura.

### `import_historical_lead_memory` — mesma situação

Depende de um fluxo de importação que não existe como rota.

## Os dois eixos que estão limpos

- **Nenhuma tela chama rota inexistente.** Varri todos os `fetch()` literais de `app/` e
  `components/` contra os arquivos `route.ts`: zero quebras. (Um falso positivo apareceu no
  meu próprio regex, que cortava template literal no `$` — `/api/v1/sales` não é chamada real.)
- **Nenhuma rota de API órfã relevante.**

## Regra ao acoplar

Todas as ligações desta sessão seguiram o mesmo padrão, e o próximo deve seguir:

1. **Detecção em runtime, não pressuposto.** `42883`/`PGRST202` (função ausente) e
   `42P01`/`PGRST205` (tabela ausente) viram recusa explicada com 503 — nunca 500 opaco.
   Assim o mesmo código serve homologação e o banco legado.
2. **Validar antes de chamar**, com os mesmos limites da constraint, para devolver 400
   explicado em vez de deixar o banco estourar.
3. **Motivo escrito** em toda decisão que muda a carteira de outra pessoa.
4. **Não fabricar string para portão ficar verde.** Se o portão cobra tela que não existe,
   o vermelho é informação verdadeira — deixe vermelho e registre aqui.
