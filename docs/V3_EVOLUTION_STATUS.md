# ATLAS V3 — Status de evolução

Data da revisão: 16 de julho de 2026  
Branch: `develop/atlas-v3`

## Método

O avanço geral é calculado pela soma do percentual comprovado de cada fase multiplicado pelo seu peso. Código existente sem teste real não recebe o mesmo crédito de um fluxo homologado.

| Fase | Peso | Avanço | Evidência principal | Próximo gate |
|---|---:|---:|---|---|
| Auditoria técnica | 10% | 95% | Doctor, enterprise check, typecheck, lint, build e smoke | Bateria autenticada real |
| Segurança, banco e multi-tenant | 15% | 78% | Guard, RLS, organização, auditoria e rate limit | Teste entre dois tenants |
| Paridade CRM com V2 | 15% | 82% | Command Center, Lead 360, pipeline, tarefas e agenda | Filtros avançados e revisão das telas legadas |
| Projetos e dados reais | 12% | 52% | Launch OS, inventário e indicadores por projeto | Validar ARVO, INSIDE PERDIZES e SPIN MOOD |
| Operação comercial | 10% | 48% | Pipeline, histórico, fila e SLA | Capacidade e distribuição homologadas |
| IA funcional | 10% | 75% | Copilot contextual, insights e Decision Center | Gateway real, score explicável e fallback |
| UX e responsividade | 10% | 90% | App Shell, Command Center e estados oficiais | Revisão final das telas operacionais |
| Homologação técnica isolada | 8% | 35% | Quality gate e smoke | Preview isolado `release/v3-homolog` |
| Homologação operacional | 5% | 0% | Roteiro documentado | Piloto de 5 a 10 dias |
| Substituição controlada | 5% | 8% | V2 preservado e rollback planejado | Backup, sincronização e rollback testados |

## Percentuais consolidados

- Evolução geral ponderada: **64%**
- Execução técnica até homologação isolada: **73%**
- Homologação operacional: **0%**

## Gates aprovados

- Node 24
- Instalação limpa
- Prisma Client
- Doctor
- Enterprise check
- TypeScript
- ESLint
- Build de produção
- Smoke V3
- Guard de autenticação
- App Shell
- Command Center

## Gates pendentes

- Credenciais exclusivas de homologação
- Readiness com banco real
- Rotas e APIs autenticadas reais
- Isolamento entre duas organizações
- Dados completos dos três projetos
- AI Gateway real
- Preview isolado
- Piloto operacional
- Backup e rollback testados

O Atlas V3 não deve ser promovido para produção enquanto os gates pendentes críticos não estiverem comprovados.
