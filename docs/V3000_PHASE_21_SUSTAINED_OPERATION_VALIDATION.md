# Atlas One V3000 — Fase 21: validação da operação sustentada

## Objetivo

Validar, de forma fail-closed, a janela operacional manual autorizada na Fase 20.
A etapa mede evidência agregada e sanitizada; não publica, não cria usuários, não
altera banco, não executa bootstrap e não amplia a operação automaticamente.

## O que precisa ser comprovado

- a mesma release, origem, janela, coorte e papéis autorizados na Fase 20;
- acesso validado para toda a coorte autorizada;
- isolamento por organização e escopos de leads, tarefas e pipeline;
- ao menos três jornadas comerciais obrigatórias concluídas, sem falha;
- disponibilidade mínima de 99% e cobertura de monitoramento de 100%;
- uma revisão diária para cada dia iniciado da janela autorizada;
- ausência de incidente crítico e de incidente grave não resolvido;
- suporte, rollback, privacidade e resultado operacional agregado revisados.

## Estados do gate

- `awaiting-sustained-operation-authorization`: a Fase 20 ainda não foi autorizada;
- `awaiting-sustained-operation-validation`: falta a evidência manual da janela;
- `sustained-operation-validated`: todas as provas foram aceitas.

Mesmo no último estado, o resultado habilita apenas uma revisão humana posterior.
`automaticProductionActionAllowed` permanece `false`.

## Evidência

Copie e preencha, fora do repositório quando contiver referências internas:

`docs/evidence/V3000_PHASE_21_SUSTAINED_OPERATION_VALIDATION_TEMPLATE.json`

Não inclua nomes, telefones, e-mails, tokens ou dados pessoais. Use somente
contagens, percentuais e uma referência sanitizada para a prova controlada.

## Verificação

```bash
npm run v3000:phase-21:test

npm run v3000:phase-21:check -- \
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
  --sustained-operation-validation-evidence /caminho/fase-21.json
```

Sem a cadeia completa de evidências, o resultado permanece pendente por desenho.
