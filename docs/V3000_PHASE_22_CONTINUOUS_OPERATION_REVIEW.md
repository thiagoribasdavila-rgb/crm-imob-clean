# Atlas One V3000 — Fase 22: revisão da operação contínua

## Objetivo

Encerrar formalmente, por decisão humana independente, a janela de operação
sustentada validada na Fase 21. O gate comprova que a decisão usa exatamente a
mesma release, coorte, escopo, janela e evidência sanitizada; ele não publica,
não amplia a operação, não cria usuários, não altera banco e não executa rollback.

## Proteção da cadeia de evidências

A decisão registra `sustainedOperationValidationEvidenceSha256`, calculado sobre
uma representação JSON canônica da evidência da Fase 21. Alterações de conteúdo,
mesmo com reorganização externa do fluxo, invalidam a revisão.

O responsável pela decisão deve ser diferente do responsável pela validação e do
responsável pelo rollback. A decisão também só pode ocorrer depois da revisão
final da Fase 21.

## Decisão permitida

O único valor aceito é `close-validated-window`. Isso significa:

- a janela observada foi revisada e encerrada;
- os resultados agregados foram aceitos para fins de aprendizado operacional;
- o planejamento do próximo ciclo pode começar;
- nenhuma continuidade, expansão ou mudança de produção é autorizada
  automaticamente.

## Estados do gate

- `awaiting-sustained-operation-validation`: a Fase 21 ainda não foi validada;
- `awaiting-continuous-operation-review`: falta a decisão humana da Fase 22;
- `continuous-operation-review-approved`: a janela foi encerrada e o próximo
  planejamento está elegível.

## Evidência

Preencha uma cópia de:

`docs/evidence/V3000_PHASE_22_CONTINUOUS_OPERATION_REVIEW_TEMPLATE.json`

Não registre nomes, e-mails, telefones, tokens, credenciais ou dados de leads.
Use contagens, percentuais e referências sanitizadas.

Para gerar o hash canônico da evidência da Fase 21:

```bash
node -e "import('./scripts/check-v3000-phase-22-continuous-operation-review.mjs').then(({ canonicalEvidenceSha256 }) => console.log(canonicalEvidenceSha256(JSON.parse(require('node:fs').readFileSync('/caminho/fase-21.json', 'utf8')))))"
```

## Verificação

```bash
npm run v3000:phase-22:test

npm run v3000:phase-22:check -- \
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
  --continuous-operation-review-evidence /caminho/fase-22.json
```

Sem a cadeia integral de evidências, o comando termina em estado pendente sem
alegar aprovação e sem produzir efeitos externos.
