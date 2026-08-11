# Consolidação limpa V3000 — Gate 8/16

## Contratos comprovados

| Camada | Estado | Evidência |
| --- | --- | --- |
| Login público | Comprovado online | `200 /login` |
| Setup público | Comprovado online | `200 /setup` |
| Dashboard protegido | Comprovado online | `307 /login?next=%2Fdashboard` |
| API anônima bloqueada | Comprovado online | `401 UNAUTHENTICATED` |
| Sessão e perfil | Contrato estático comprovado | `lib/api/security.ts` |
| Organização e papéis | Contrato estático comprovado | `lib/api/security.ts` |
| Bearer token | Contrato estático comprovado | `lib/security/api-auth.ts` |
| RLS | Prova estática aprovada | `npm run rls:check` |
| Matriz RLS | Guardas locais aprovadas | `npm run atlas:rls-matrix:check` |
| Sessão autenticada real | Pendente | sessão segura indisponível ao executor |
| Negação cross-tenant real | Pendente | depende de sessão autenticada controlada |

## Decisão

O gate permanece `IN_PROGRESS`. A ausência de uma sessão segura não é convertida em aprovação presumida e não autoriza ZIP ou release.

## Próxima prova

Executar o roteiro autenticado com uma sessão temporária e controlada, sem copiar cookies e sem utilizar `service_role` como prova de usuário. O roteiro deve ler `/api/v1/auth/me`, confirmar o tenant e exercer uma leitura permitida e outra negada por organização.
