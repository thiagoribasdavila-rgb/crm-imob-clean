# Fase 204 — Admissão na matriz de evidências

## Resultado

A fase cria uma fronteira determinística entre procedência verificada e avaliação de gates. Um lote só fica elegível para a matriz quando todo o seu contexto, política, intake, envelope, resultado criptográfico e registros forem íntegros.

## Regras de segurança

- Admissão atômica: um erro coloca o lote inteiro em quarentena.
- Revalidação independente do resultado de procedência.
- Bloqueio de replay por hash do intake, `evidenceId` e hash do registro.
- Bloqueio de registros expirados, admissão antecipada ou fora da janela de 600 segundos.
- Resultado canônico com hash SHA-256 e manifesto exato dos registros admitidos.
- Nenhuma avaliação da matriz, execução de gates, alteração da memória, build, ZIP ou deploy.

## Estado canônico

O projeto real continua sem signatários configurados e sem evidências admitidas. O checker usa uma chave Ed25519 efêmera somente em memória para provar o contrato; nenhuma chave privada é persistida.

## Próxima fase

A fase 205 poderá avaliar a cobertura da matriz exclusivamente a partir de resultados de admissão válidos. Promoção, empacotamento e deploy permanecem bloqueados.
