# V3000 — Fase 31: prontidão de execução baseada na baseline

## Objetivo

Converter o plano documental aprovado na Fase 30 em uma autorização humana,
limitada e auditável para uma futura execução manual. Este gate não executa o
ciclo, não publica código, não altera banco e não provisiona usuários.

## O que o gate prova

- a evidência factual da Fase 30 foi revisada e teve seu hash canônico validado;
- artefato, release, baseline, plano e ciclo continuam sendo os mesmos;
- coorte e papéis permanecem dentro do teto aprovado;
- jornadas, disponibilidade, monitoramento e tolerância zero não regrediram;
- custo, suporte, rollback, privacidade e riscos foram revisados;
- revisor, autorizador e testemunha são independentes da Fase 30;
- a janela autorizada permanece dentro da janela planejada;
- somente uma execução manual futura foi autorizada.

## Estados

- `awaiting-baseline-backed-execution-readiness-review`: aguarda evidência humana;
- `baseline-backed-next-cycle-execution-authorized`: revisão aprovada, execução
  manual futura autorizada e evidência da execução obrigatória.

Mesmo aprovado, o resultado mantém:

- `nextCycleExecutionStarted: false`;
- `automaticExecutionAllowed: false`;
- `automaticProductionActionAllowed: false`;
- `deploymentPerformedByGate: false`;
- `databaseMutationsByGate: 0`;
- `usersProvisionedByGate: 0`.

## Evidência

Use `docs/evidence/V3000_PHASE_31_BASELINE_BACKED_EXECUTION_READINESS_TEMPLATE.json`
somente após a revisão humana. Não inclua nomes, e-mails, telefones, chaves ou
outros dados pessoais; use identificadores sanitizados.

Para aprovação, registre:

- `status: "approved"`;
- `decision: "authorize-baseline-backed-next-cycle-execution"`;
- `readinessDecisionRole: "DIRETOR"`;
- hash canônico da evidência da Fase 30;
- coorte, papéis, metas, teto de custo e janela autorizados;
- revisores independentes e cronologia verificável;
- todas as confirmações obrigatórias como `true`.

## Verificação

```bash
npm run v3000:phase-31:test
```

O verificador completo aceita os mesmos argumentos das Fases 11–30, acrescidos
de:

```text
--baseline-backed-execution-readiness-evidence <evidencia-fase-31.json>
```

## Próximo gate

A Fase 32 deverá registrar e validar a execução manual efetivamente realizada.
A aprovação desta fase não substitui essa prova e não permite expansão,
rollback ou deploy automáticos.
