# Atlas One V3000 — Fase 36

## Revisão humana e priorização das propostas de melhoria

A Fase 36 transforma as propostas documentais da Fase 35 em um backlog
priorizado, rastreável e pronto apenas para uma futura revisão de planejamento.
Ela preserva o mesmo artefato, release, ciclos, baseline verificada e revisão de
lições aprendidas por meio de SHA-256 canônico da evidência anterior.

O gate não planeja, executa ou implanta melhorias. Também não altera a baseline,
não abre ciclo, não provisiona usuários e não toca no banco. Seu único resultado
aprovado é registrar quais propostas foram aceitas, adiadas ou rejeitadas e abrir
a necessidade de revisão humana do planejamento.

## Critérios de revisão

Todas as propostas precisam ser revisadas e sustentadas por evidência. Cada
proposta aceita deve ter:

- prioridade `P1`, `P2` ou `P3`;
- responsável;
- prazo;
- critério de aceite;
- dependências avaliadas;
- impactos de negócio, operação, usuário, segurança, privacidade, custo e risco.

`P0` não é aceito neste gate porque a cadeia validada declara zero incidente
crítico, zero incidente grave não resolvido e zero regressão material. Uma
necessidade P0 deve seguir o fluxo específico de incidente crítico.

## Estados

- `awaiting-baseline-backed-improvement-proposal-review-evidence`: a revisão
  ainda não foi comprovada.
- `baseline-backed-improvement-proposals-reviewed`: todas as propostas foram
  classificadas e as aceitas foram priorizadas.
- Estados anteriores da cadeia são preservados sem promoção automática.

## Evidência operacional

Copie
`docs/evidence/V3000_PHASE_36_BASELINE_BACKED_IMPROVEMENT_PROPOSAL_REVIEW_TEMPLATE.json`
para um arquivo não versionado. Preencha somente após a revisão real, sem
segredos e sem dados pessoais.

A decisão exige papel `DIRETOR`, testemunha distinta, duração mínima de 20
minutos, revisão de todas as propostas, zero alegação sem evidência e zero efeito
colateral no ambiente.

## Verificação

```bash
npm run v3000:phase-36:test
```

Para avaliar evidência real:

```bash
npm run v3000:phase-36:check -- \
  --phase-35-result /caminho/seguro/fase-35-result.json \
  --phase-35-evidence /caminho/seguro/fase-35-evidence.json \
  --phase-36-evidence /caminho/seguro/fase-36-evidence.json
```

Sem evidência real, o resultado correto permanece pendente. Concluir a
implementação local do gate não significa afirmar que a revisão operacional
ocorreu.

## Próximo controle

Uma revisão aprovada abre somente
`improvementPlanningReviewRequired: true`. Planejamento, execução, mutação da
baseline, deploy, expansão, rollback e ativação de ciclo continuam bloqueados.
