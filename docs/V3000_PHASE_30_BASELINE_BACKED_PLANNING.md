# Atlas One V3000 — Fase 30: planejamento baseado na baseline verificada

## Objetivo

Encerrar o primeiro ciclo V3000 com um planejamento humano, limitado e rastreável para o ciclo seguinte. O gate usa exclusivamente a baseline verificada na Fase 29 e transforma lições aceitas em objetivos, limites, métricas, custo, suporte e rollback documentados.

Esta fase não executa o plano. Ela não publica, não cria usuários, não roda bootstrap, não aplica migrations e não altera banco, baseline, produção ou dados comerciais.

## Estados seguros

- Enquanto uma fase anterior estiver pendente, o respectivo estado é preservado.
- Com a Fase 29 concluída, mas sem plano aprovado: `awaiting-baseline-backed-next-cycle-plan`.
- Com revisão humana integral: `baseline-backed-next-cycle-plan-approved`.

O estado final autoriza somente a existência documental do plano. A execução continua bloqueada e exige uma revisão específica de prontidão no ciclo seguinte.

## Evidência obrigatória

Use uma cópia de `docs/evidence/V3000_PHASE_30_BASELINE_BACKED_PLANNING_TEMPLATE.json`. O template vazio não é prova. O planejamento deve:

1. recalcular o hash canônico da evidência da Fase 29;
2. preservar artefato, release, baseline verificada e referências sanitizadas;
3. usar um identificador de ciclo futuro distinto do ciclo encerrado;
4. registrar objetivos, escopo, não objetivos, métricas, suporte, privacidade, risco e rollback;
5. limitar a coorte ao máximo já validado na baseline;
6. preservar exatamente os papéis `DIRETOR`, `GERENTE` e `CORRETOR`;
7. impedir regressão de jornadas, disponibilidade e cobertura de monitoramento;
8. manter tolerância zero a falha de jornada obrigatória, incidente crítico, incidente grave aberto e regressão material;
9. definir teto de custo igual ou superior ao custo observado;
10. usar responsável, aprovador e testemunha independentes;
11. durar pelo menos vinte minutos e respeitar a cronologia da cadeia;
12. não conter segredos nem dados pessoais;
13. comprovar ausência de migrations, bootstrap, mutações comerciais, provisionamento e ações automáticas.

## Comando

```bash
npm run v3000:phase-30:check -- \
  --zip=/caminho/release.zip \
  --checksum=/caminho/release.sha256 \
  --proof=/caminho/proof.json \
  --lessons-learned-evidence=/caminho/fase-28.json \
  --baseline-verification-evidence=/caminho/fase-29.json \
  --baseline-backed-planning-evidence=/caminho/fase-30.json
```

As evidências das Fases 11–27 também permanecem obrigatórias quando a cadeia já tiver avançado.

## Critério de conclusão

Somente `baseline-backed-next-cycle-plan-approved` conclui a Fase 30. O resultado mantém `nextCycleExecutionAuthorized: false`, `automaticExecutionAllowed: false` e exige `nextCycleExecutionReadinessReviewRequired: true`.

Assim, o ciclo termina com memória operacional e um plano verificável, sem confundir planejamento com autorização para executar.
