# Atlas One V3000 — Fase 25: execução manual do próximo ciclo

## Objetivo

Comprovar, por evidência factual e sanitizada, que o ciclo autorizado na Fase
24 foi executado manualmente dentro dos limites aprovados. Esta fase não inicia
o ciclo, não publica código, não altera banco, não cria usuários, não amplia a
coorte e não executa rollback.

## O que é comprovado

- a mesma release, artefato e identificação de ciclo;
- execução dentro da janela autorizada;
- coorte e papéis limitados ao autorizado;
- jornadas obrigatórias concluídas sem falha;
- disponibilidade e cobertura de monitoramento acima das metas;
- custo dentro do teto aprovado;
- ausência de incidentes críticos ou graves não resolvidos;
- suporte, privacidade, congelamento de mudanças e rollback preservados.

A conclusão da Fase 25 prova a execução. Ela ainda não equivale à validação
operacional posterior do ciclo, que permanece obrigatória.

## Estados do gate

- `awaiting-next-cycle-plan`: não há plano aprovado;
- `awaiting-next-cycle-execution-authorization`: a execução ainda não foi
  autorizada pela Fase 24;
- `awaiting-next-cycle-execution-evidence`: a autorização existe, mas falta a
  prova da execução manual;
- `next-cycle-executed`: a execução foi comprovada e aguarda validação
  posterior.

## Evidência

Preencha uma cópia de:

`docs/evidence/V3000_PHASE_25_NEXT_CYCLE_EXECUTION_TEMPLATE.json`

Use apenas identificadores sanitizados. Nunca registre nomes, e-mails,
telefones, dados de leads, credenciais, tokens ou qualquer outro dado pessoal.

O campo `nextCycleExecutionReadinessEvidenceSha256` deve conter o hash canônico
da evidência aprovada na Fase 24:

```bash
node -e "import('./scripts/check-v3000-phase-25-next-cycle-execution.mjs').then(({ canonicalEvidenceSha256 }) => console.log(canonicalEvidenceSha256(JSON.parse(require('node:fs').readFileSync('/caminho/fase-24.json', 'utf8')))))"
```

## Verificação

```bash
npm run v3000:phase-25:test

npm run v3000:phase-25:check -- \
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
  --next-cycle-planning-evidence /caminho/fase-23.json \
  --next-cycle-execution-readiness-evidence /caminho/fase-24.json \
  --next-cycle-execution-evidence /caminho/fase-25.json
```

Sem a cadeia integral de evidências, o gate permanece pendente e não produz
efeitos externos.

## Garantias

- zero deploy realizado pelo gate;
- zero migration, bootstrap ou mutação de negócio realizada pelo gate;
- zero usuário provisionado pelo gate;
- zero segredo ou dado pessoal armazenado;
- zero expansão ou rollback automático;
- separação entre revisão, autorização, execução e testemunho.
