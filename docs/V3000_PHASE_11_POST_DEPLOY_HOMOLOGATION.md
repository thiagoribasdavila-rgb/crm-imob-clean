# Atlas One V3000 — Fase 11: gate de homologação pós-instalação

## Resultado

A Fase 11 transforma o candidato comprovado na Fase 10 em uma entrega
rastreável. O gate reconhece somente o ZIP cujo conteúdo, checksum, prova de
build e fingerprint correspondem ao candidato aprovado. Um pacote recomposto,
renomeado ou alterado é recusado.

## Estado factual

| Camada | Estado |
| --- | --- |
| ZIP exato da Fase 10 | Aprovado automaticamente |
| SHA-256 externo | Aprovado |
| Prova gerada do próprio ZIP | Aprovada |
| Build limpo extraído do ZIP | Aprovado na Fase 10 |
| Deploy na Hostinger | Não executado nesta fase |
| Validação autenticada de `/notifications` | Pendente do deploy autorizado |
| Promoção do template para telas centrais | Bloqueada até a prova autenticada |

A execução automatizada desta fase está registrada em
`docs/evidence/V3000_PHASE_11_CANDIDATE_GATE.json`: 30 contratos aprovados,
TypeScript e lint sem erros, sem deploy e sem mutação de banco.

## O que o gate exige depois da instalação

1. o artefato implantado deve ser identificado pelo SHA-256 aprovado;
2. `/notifications` precisa responder dentro de uma sessão autenticada;
3. desktop, mobile e teclado precisam preservar a área de trabalho;
4. loading, vazio, erro recuperável e Realtime precisam ser observados;
5. leitura e dispensa devem usar somente um registro seguro de teste;
6. o registro de teste precisa ser removido e dados comerciais não podem sofrer
   mutação;
7. console, evidências e revisor precisam ficar registrados.

O modelo a preencher está em
`docs/evidence/V3000_PHASE_11_POST_DEPLOY_TEMPLATE.json`. Valores `null` não são
aprovação; o verificador exige evidência completa e falha de forma fechada.

## Comando de identificação antes do deploy

```bash
node scripts/check-v3000-phase-11-homologation.mjs \
  --zip /caminho/atlas-one-v3000-phase-10-proven.zip \
  --checksum /caminho/atlas-one-v3000-phase-10-proven.zip.sha256 \
  --proof /caminho/atlas-one-v3000-phase-10-proven.zip.proof.json
```

O resultado correto é `artifactVerified=true`,
`productionStatus=pending-authorized-deployment` e
`eligibleForTemplatePromotion=false`.

## Comando do gate final

Depois de uma instalação autorizada e da coleta autenticada, repita o comando
incluindo:

```bash
--evidence /caminho/V3000_PHASE_11_POST_DEPLOY_APPROVED.json
```

Somente uma prova completa retorna `productionStatus=approved` e libera a
promoção gradual do template.

## Limites preservados

- nenhum deploy foi executado;
- nenhuma migration foi aplicada;
- nenhum dado ou segredo foi lido ou alterado;
- nenhum `.env` real entra no gate;
- o gate não faz chamadas de rede e não confunde disponibilidade pública com
  paridade autenticada.
