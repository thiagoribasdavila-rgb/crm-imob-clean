# R377 — Reconciliação segura do banco

Data da auditoria: 10/08/2026
Projeto remoto preservado: `pozbrcsfthnhmnebfoxv` (`atlas-v3-homologacao`)

## Resultado

- Nenhum reset, bootstrap ou apagamento foi executado no banco remoto.
- Administrador, organização, perfil e dados reais não foram alterados.
- A comparação encontrou 384 versões: 136 somente locais e 248 somente remotas. Por isso, `supabase db push` e `migration repair` em massa permanecem proibidos.
- Três timestamps locais duplicados foram normalizados para versões únicas, sem contraparte remota.
- A migration `20260719092358_phase_029_meta_permit_atomic_ledger.sql` foi preservada em `supabase/migration-rehearsals/`: ela exige deliberadamente um clone `staging_clone` e não pertence à cadeia oficial de instalação.
- A cadeia oficial foi executada do zero até `20260810150000_reconcile_remote_function_contracts.sql` sem erro SQL.

## Contratos reconciliados

A migration `20260810150000_reconcile_remote_function_contracts.sql` corrige, de forma idempotente, treze incompatibilidades detectadas pelo lint remoto:

- `tasks.assigned_to` para `tasks.user_id`;
- `tasks.due_at` para `tasks.due_date`;
- títulos de atividades preservados em `activities.metadata`;
- variável ambígua de gerente isolada;
- bloqueio de release sem `FOR UPDATE` sobre agregação;
- `digest` resolvido pelo schema `extensions`;
- referências legadas de responsável de lead normalizadas para `assigned_to`.

## Provas isoladas

O schema público e privado foi restaurado em laboratório descartável e apresentou:

- 188 tabelas públicas;
- 136 funções públicas;
- 223 policies públicas;
- 39 funções privadas;
- lint `public,private` com zero erro.

Contagens restauradas para validação de integridade:

| Tabela | Linhas |
|---|---:|
| organizations | 2 |
| profiles | 28 |
| leads | 661 |
| developments | 4 |
| tasks | 77 |
| marketing_campaigns | 8 |

## Estado dos serviços locais

O PostgreSQL concluiu toda a cadeia. Depois disso, os serviços opcionais de Vector/Analytics foram excluídos por incompatibilidade do socket Colima. Em uma segunda inicialização, Realtime/Storage não atingiram o healthcheck no tempo do CLI. Isso não representa falha de migration e não autoriza ocultar a limitação: o teste completo desses serviços deve ser repetido em runtime Docker saudável antes de promover a release.

## Aplicação remota segura

Não aplicar o histórico local inteiro. O procedimento aprovado é:

1. criar backup nativo do ambiente remoto;
2. revisar somente `20260810150000_reconcile_remote_function_contracts.sql`;
3. aplicar a migration isoladamente, dentro de transação e janela controlada;
4. executar `supabase db lint --linked --schema public,private --level error`;
5. executar smoke autenticado dos fluxos afetados;
6. registrar a versão somente após evidência positiva.

Nenhuma credencial deve ser colocada em documentação, logs, commit ou ZIP.
