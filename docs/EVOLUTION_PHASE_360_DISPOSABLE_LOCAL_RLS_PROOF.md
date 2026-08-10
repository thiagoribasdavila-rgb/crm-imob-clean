# ATLAS ONE — Fase 360: prova local descartável de RLS

## Objetivo

Comprovar em uma pilha Supabase local criada do zero que a hierarquia comercial
e o isolamento entre organizações são aplicados pelo PostgreSQL, sem depender
de filtros da interface e sem tocar no ambiente remoto.

## Defeito encontrado e corrigido

O primeiro ensaio real detectou uma falha no trigger
`private.apply_canonical_lead_contract()`: a variável `issues` é `text[]`, mas a
função concatenava valores escalares (`issues || 'contact'`). Um insert de lead
sem telefone ou e-mail falhava com `malformed array literal`.

A correção foi entregue pela migration aditiva e idempotente
`20260809230000_fix_canonical_lead_contract_issue_array.sql`. A função mantém o
mesmo contrato e os mesmos controles `security definer`/`search_path`, passando
a usar `array_append` em todos os dez sinais de qualidade. Nenhuma migration
histórica foi reescrita.

## Ensaio executado

O executor:

- cria uma cópia descartável sem arquivos `.env`, chaves, certificados ou ZIPs;
- inicia uma pilha Supabase local sem `analytics` e `vector`;
- aplica as 134 migrations desde uma base vazia;
- cria somente dentro da transação de teste duas organizações, quatro perfis e
  dois leads sintéticos;
- executa a prova pgTAP por corretor, gerente e diretor;
- comprova negação de leitura e escrita cruzada entre tenants;
- comprova que RPCs privilegiados continuam restritos ao servidor;
- executa lint SQL com nível `error`;
- desfaz as fixtures por `rollback`, encerra os contêineres e apaga a cópia.

## Resultado comprovado

Em 9 de agosto de 2026, o ciclo terminou como `passed`:

- 134/134 migrations aplicadas;
- 20/20 asserções pgTAP aprovadas;
- 0 falhas pgTAP;
- lint do banco aprovado sem erros;
- escopo do corretor aprovado;
- escopo do gerente aprovado;
- escopo do diretor aprovado;
- leitura e escrita cross-tenant negadas;
- RPCs privilegiados mantidos como server-only;
- teste canônico e migrations históricas preservados;
- staging temporário removido;
- nenhum projeto vinculado, banco operacional ou segredo utilizado.

A evidência sanitizada está em
`artifacts/runtime/atlas-phase-360-disposable-local-rls-proof.json`.

## Comandos

- `npm run atlas:phase360:assess` — avalia pré-condições sem executar SQL;
- `npm run atlas:phase360:check` — valida o executor e seus fail-closed;
- `npm run atlas:phase360:execute` — executa o ensaio local completo.

## Limite da evidência

Esta prova autoriza afirmar que o catálogo local provisiona e que o contrato
RLS ensaiado funciona no clone descartável. Ela não aplica a nova migration no
Supabase remoto, não substitui homologação autenticada no navegador e não
autoriza deploy ou ZIP automaticamente.
