# Atlas One V3000 — Fase 23: planejamento controlado do próximo ciclo

## Objetivo

Converter o encerramento humano da janela validada na Fase 22 em um plano
limitado, mensurável e auditável para o próximo ciclo. A Fase 23 aprova apenas o
plano: não publica, não inicia o ciclo, não aumenta a coorte, não cria usuários,
não altera banco e não executa rollback.

## Continuidade da cadeia de evidências

O plano registra `continuousOperationReviewEvidenceSha256`, calculado sobre a
representação JSON canônica da evidência da Fase 22. O gate também exige a mesma
identidade de release e do artefato comprovado desde a Fase 11.

O responsável pelo planejamento deve ser diferente do responsável que encerrou
a janela anterior. A aprovação deve ser feita por outra pessoa e acontecer
depois do encerramento da Fase 22. A janela planejada começa somente depois da
aprovação e precisa ter início e fim explícitos.

## Limites obrigatórios

- a coorte planejada não pode superar a coorte já revisada;
- os papéis permanecem `DIRETOR`, `GERENTE` e `CORRETOR`;
- as metas de disponibilidade, monitoramento e jornadas não podem regredir;
- falhas obrigatórias e incidentes críticos ou graves continuam com tolerância zero;
- o custo tem teto explícito, inclusive quando o teto for zero;
- nenhuma ação de produção é autorizada por este gate.

## Decisão permitida

O único valor aceito é `approve-next-cycle-plan`. Quando aprovado, o plano fica
elegível para uma revisão de execução posterior. Isso não significa autorização
de execução.

## Estados do gate

- `awaiting-continuous-operation-review`: a Fase 22 ainda não encerrou a janela;
- `awaiting-next-cycle-plan`: falta o plano humano da Fase 23;
- `next-cycle-plan-approved`: plano aprovado e elegível somente para revisão de
  execução.

## Evidência

Preencha uma cópia de:

`docs/evidence/V3000_PHASE_23_NEXT_CYCLE_PLANNING_TEMPLATE.json`

Use apenas identificadores e referências sanitizadas. Não registre nomes,
e-mails, telefones, dados de leads, credenciais ou tokens.

Para gerar o hash canônico da evidência da Fase 22:

```bash
node -e "import('./scripts/check-v3000-phase-23-next-cycle-planning.mjs').then(({ canonicalEvidenceSha256 }) => console.log(canonicalEvidenceSha256(JSON.parse(require('node:fs').readFileSync('/caminho/fase-22.json', 'utf8')))))"
```

## Verificação

```bash
npm run v3000:phase-23:test

npm run v3000:phase-23:check -- \
  --zip /caminho/atlas-one-v3000-phase-10-proven.zip \
  --checksum /caminho/atlas-one-v3000-phase-10-proven.zip.sha256 \
  --proof /caminho/atlas-one-v3000-phase-10-proven.zip.proof.json \
  --production-evidence /caminho/fase-11.json \
  --release-evidence /caminho/fase-13.json \
  --observation-evidence /caminho/fase-14.json \
  --pilot-evidence /caminho/fase-15.json \
  --pilot-validation-evidence /caminho/fase-16.json \
  --expansion-evidence /caminho/fase-17.json \
  --execution-evidence /caminho/fase-18.json \
  --expanded-cohort-validation-evidence /caminho/fase-19.json \
  --sustained-operation-evidence /caminho/fase-20.json \
  --sustained-operation-validation-evidence /caminho/fase-21.json \
  --continuous-operation-review-evidence /caminho/fase-22.json \
  --next-cycle-planning-evidence /caminho/fase-23.json
```

Sem a cadeia integral de evidências, o comando fica pendente e não produz
efeitos externos.
