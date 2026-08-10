# ATLAS V30 — Estado da consolidação

**Atualizado em:** 2026-07-23T16:26:43.450Z

## Resultado executivo

O código ativo está sem falhas nos gates locais executados, mas o produto ainda
não pode ser chamado de **10/10 operacional**. O estado correto é
**candidato local aguardando ambiente real**.

- **26 de 28 fases pré-finais aprovadas localmente (92.9%)**
- **26 de 30 fases totais aprovadas localmente (86.7%)**
- **94 gates únicos avaliados**
- **88 gates passaram**
- **0 falhas de código**
- **0 fase(s) aguardando instalação**
- **2 fase(s) aguardando ambiente/evidência real**
- **build completo não executado**
- **nenhum ZIP atual está elegível para release**

O percentual mede evidência, não quantidade de telas ou scripts. As fases 29 e 30
continuam fechadas para evitar um pacote aparentemente pronto, mas ainda sem
prova de restauração, autenticação por papel e integrações reais.

## Rastreabilidade e artefato existente

- a pasta atual **não possui metadados Git** e está sendo validada por hash de conteúdo;
- há um ZIP anterior em `dist/hostinger/atlas-v3-hostinger-homologation.zip`, porém ele está **rejeitado para release** porque antecede as correções atuais e não passou pelas fases 26–29;
- o conteúdo de `.next` e qualquer pacote antigo não contam como prova do build
  final; ambos são regenerados ou excluídos pelo fluxo oficial.

## Fases ainda abertas

| Fase | Capacidade | Estado | Bloqueio |
|---:|---|---|---|
| 27 | Jornadas E2E autenticadas | waiting_environment | test:e2e: gate executado e bloqueado somente por dependências do ambiente real<br>smoke:v3: depende de aplicação executando em URL de homologação<br>routes:real: depende de URL, Supabase e conta de teste reais |
| 28 | Carga, segurança e recuperação | waiting_environment | security:dependencies: depende do registry npm para auditoria atualizada<br>preflight:production: gate executado e bloqueado somente por dependências do ambiente real<br>runtime:evidence:check: gate executado e bloqueado somente por dependências do ambiente real |
| 29 | Build único, manifesto e ZIP Hostinger | não iniciada | depende das fases 1–28 |
| 30 | Implantação e teste real controlado | não iniciada | depende do ZIP aprovado |

## Evidência operacional

| Evidência | Estado registrado | Pronta |
|---|---|---|
| `artifacts/runtime/human-gates/f02-f16-upstream-readiness-evidence.json` | upstream_technical_chain_blocked | não |
| `artifacts/runtime/human-gates/f17-f21-readiness-evidence.json` | human_gate_chain_blocked | não |
| `artifacts/runtime/phase-022/environment-readiness-evidence.json` | local_rehearsal_environment_blocked | não |
| `artifacts/runtime/phase-023/sanitized-homologation-evidence-dossier.json` | homologation_evidence_not_generated | não |
| `artifacts/runtime/phase-024/final-human-homologation-decision-evidence.json` | final_homologation_decision_contract_ready_phase_023_dossier_and_human_decision_required | não |

Os checks de migrations e RLS aprovados nas fases locais validam que os contratos
**falham de forma segura**. Eles não significam que backup, restore, migration e
isolamento dinâmico já foram executados em homologação.

## O que já está consolidado

- fonte única e rotas ativas sem colisão;
- 286 arquivos de rota ativos e 137 legados isolados;
- 136 páginas ativas, 32 destinos oficiais e 78 links internos estáticos
  verificados;
- cobertura TypeScript do contrato ativo em 100%;
- contrato do Next 16 validado automaticamente na superfície publicada;
- autenticação, hierarquia, segurança de API e compatibilidade de schema
  verificadas estaticamente;
- CRM, Kanban, tarefas, Cliente 360, projetos, IA, Meta/CAPI e dashboards com
  contratos locais aprovados;
- pacote final protegido contra segredos e rastreado por hash de conteúdo;
- política de um único build completo preservada para a fase 29.

## Última regressão local

Executada com Node.js 24 em 23/07/2026:

- consolidação: aprovada;
- lapidação V30: 94/94;
- grants Supabase: 63/63;
- endurecimento Supabase: 17/17;
- cadeia técnica F02–F16: 42/42;
- cadeia humana F17–F21: 32/32;
- testes de contrato: 9/9;
- TypeScript: aprovado;
- ESLint: aprovado sem warnings.

O teste E2E continua corretamente bloqueado porque ainda faltam Supabase,
service role e quatro contas sintéticas por papel. O `npm audit` também continua
sem evidência atual porque o registry npm ficou inacessível no ambiente e a
elevação foi recusada pela ferramenta.

## Sequência para chegar a 10/10

1. preencher `.env.local` apenas no ambiente seguro de homologação;
2. concluir backup, restauração e ensaio isolado do Supabase;
3. executar as quatro jornadas autenticadas com o Playwright já instalado;
4. provar IA, WhatsApp, lead Meta e CAPI com teste controlado;
5. registrar aprovação humana;
6. reconciliar a fonte com o repositório oficial ou registrar formalmente o hash
   do snapshot;
7. executar o único build, gerar e verificar um **novo** ZIP;
8. implantar na Hostinger e repetir o smoke test real.

Nenhum segredo deve entrar no Git, no chat ou no ZIP.
