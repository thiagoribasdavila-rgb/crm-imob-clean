# ATLAS ONE V3000 — Fase 20: autorização da operação sustentada

## Objetivo

Converter a validação factual da coorte expandida da Fase 19 em uma autorização humana, limitada e rastreável para continuidade manual da operação real.

Esta fase é somente um **gate de decisão**. Ela não publica, não cria usuários, não executa bootstrap, não altera banco, não movimenta leads e não inicia ou encerra a janela operacional automaticamente.

## Pré-condição

A Fase 19 precisa retornar simultaneamente:

- `expandedCohortValidated: true`;
- `sustainedOperationEligible: true`;
- identidade do mesmo artefato aprovado.

Sem essa prova, a Fase 20 permanece em `awaiting-expanded-cohort-validation`.

## Autorização humana exigida

Copie `docs/evidence/V3000_PHASE_20_SUSTAINED_OPERATION_TEMPLATE.json` para um arquivo local não versionado e registre somente informação agregada e sanitizada.

A decisão deve:

- ser `APPROVE_SUSTAINED_OPERATION` e ter aprovação de papel Diretor;
- manter exatamente a mesma coorte validada na Fase 19;
- preservar Diretor, Gerente e Corretor sem ampliar papéis;
- confirmar isolamento da organização e escopos de leads, tarefas e pipeline;
- manter monitoramento, suporte, rollback, revisão diária e escalonamento de incidentes;
- autorizar uma janela entre 24 e 168 horas;
- registrar zero incidente crítico ou grave não resolvido;
- não incluir credencial, telefone, e-mail, nome de cliente ou outro dado pessoal.

## Execução

```bash
npm run v3000:phase-20:check -- \
  --zip /caminho/release.zip \
  --checksum /caminho/release.zip.sha256 \
  --proof /caminho/release.zip.proof.json \
  --production-evidence /caminho/fase-11.json \
  --release-evidence /caminho/fase-13.json \
  --observation-evidence /caminho/fase-14.json \
  --pilot-evidence /caminho/fase-15.json \
  --pilot-validation-evidence /caminho/fase-16.json \
  --expansion-evidence /caminho/fase-17.json \
  --execution-evidence /caminho/fase-18.json \
  --expanded-cohort-validation-evidence /caminho/fase-19.json \
  --sustained-operation-evidence /caminho/fase-20.json
```

O retorno aprovado é `manual-sustained-operation-authorized`. Ele autoriza somente a condução humana da janela registrada; nenhuma ação de produção é executada pelo gate.

## Resultado seguro sem evidência real

Sem a decisão humana, a checagem retorna `awaiting-sustained-operation-decision` com sucesso técnico, mas sem alegar autorização. Assim, a operação atual, o banco, os usuários e a release permanecem intactos.
