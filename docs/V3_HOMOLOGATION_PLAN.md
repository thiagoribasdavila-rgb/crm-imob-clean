# ATLAS V3 — Plano de Evolução até Homologação

## Proteção do V2

- O repositório `atlas-crm-v1` e o deploy atual na Hostinger permanecem congelados.
- Nenhum merge, migration destrutiva ou alteração de domínio do V2 será realizado durante a evolução do V3.
- O V2 será mantido como rollback até a aprovação final do V3.

## Branch de trabalho

- Desenvolvimento: `develop/atlas-v3`
- Homologação futura: `release/v3-homolog`
- Produção: somente após aprovação formal

## Fase 1 — Auditoria técnica

Executar:

```bash
node -v
npm ci
npm run prisma:generate
npm run doctor
npm run enterprise:check
npm run typecheck
npm run lint
npm run build
npm run smoke:v3
npm run routes:real
npm run preflight:production
npm run test:real
```

Registrar cada item como `PASS`, `FAIL`, `BLOQUEADO` ou `NÃO TESTADO`.

## Fase 2 — Segurança, banco e multi-tenant

Validar autenticação, sessão, organizações, roles, isolamento entre tenants, Prisma, Supabase, migrations e políticas de acesso.

## Fase 3 — Paridade CRM com V2

Validar e concluir:

1. Dashboard
2. Leads
3. Lead 360
4. Pipeline
5. Tarefas
6. Agenda
7. Corretores
8. Follow-up
9. Histórico
10. Busca e filtros

## Fase 4 — Projetos e dados reais

- ARVO: leads atuais do CRM
- INSIDE PERDIZES: book, tabela, unidades e leads próprios
- SPIN MOOD: book, tabela, estoque e leads próprios

Nenhum lead poderá ficar sem projeto ou ser misturado entre empreendimentos.

## Fase 5 — Operação comercial

Implementar e validar distribuição automática, capacidade do corretor, fila, SLA, tarefas automáticas, redistribuição e histórico.

## Fase 6 — IA funcional

Concluir score, classificação, resumo de lead, próxima melhor ação, Copilot contextual, memória e fallback seguro.

## Fase 7 — UX e responsividade

Aprovar Command Center, Leads, Lead 360, Pipeline, Tarefas, Agenda, Projetos, Copilot, estados de loading/erro e mobile.

## Fase 8 — Homologação técnica isolada

Criar `release/v3-homolog` e publicar em ambiente Hostinger separado, sem substituir o V2.

## Fase 9 — Homologação operacional

Executar testes reais com administrador, gestor e corretor durante 5 a 10 dias úteis.

## Fase 10 — Substituição controlada

Backup final, sincronização, congelamento do V2, troca de domínio, monitoramento e rollback disponível.

## Critério final de aprovação

- Build, typecheck e lint aprovados
- Testes críticos aprovados
- Paridade funcional com V2
- Dados separados por projeto
- Multi-tenant validado
- Fluxo completo de lead aprovado
- Backup e rollback testados
- Homologação operacional aprovada
