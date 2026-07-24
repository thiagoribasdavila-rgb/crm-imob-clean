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

## Ainda órfãs — nenhum chamador no código

| RPC | o que destravaria | esforço | risco |
|---|---|---|---|
| **`move_pipeline_lead`** | movimentação atômica no Kanban. Hoje o arrastar-e-soltar escreve direto; dois usuários movendo a mesma lead podem se sobrepor. **É a operação mais usada do produto.** | médio | médio — mexe no caminho quente |
| **`manage_commercial_profile`** | criação e edição de usuário com validação de hierarquia no banco. Destrava `commercial-hierarchy:check`. A rota hoje escreve direto em `profiles`. | médio | médio — toca permissão |
| **`create_lead_atomic`** | criação de lead sem risco de duplicata em concorrência | baixo | baixo |
| **`mutate_crm_project_v1`** | escrita governada de projeto, com auditoria em `crm_project_events` | baixo | baixo |
| **`version_project_material`** | versionamento de material do empreendimento | baixo | baixo |
| **`import_historical_lead_memory`** | importação de memória de leads históricos | baixo | baixo |
| `process_expired_lead_reservations` | worker que devolve à fila a reserva não aceita. **Sem ele o aceite é opcional na prática** — nada expira. | baixo | baixo |

## Recomendação de ordem

1. **`process_expired_lead_reservations`** — pequeno e fecha o ciclo da reserva que esta
   sessão abriu. Sem ele, "aceite em 5 minutos" não significa nada.
2. **`move_pipeline_lead`** — maior retorno operacional: é o gesto que o corretor faz o dia
   inteiro, e é onde concorrência dói.
3. **`manage_commercial_profile`** — destrava um portão e move a governança de usuário para
   o banco, onde a regra de hierarquia já existe.
4. O resto, por oportunidade.

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
