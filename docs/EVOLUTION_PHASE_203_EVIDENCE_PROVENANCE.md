# ATLAS AI OS — Fase 203/3000

## Objetivo

Verificar autoria, origem e integridade dos recibos aceitos na fase 202 antes de permitir que qualquer evidência alcance a matriz de gates.

## Resultado

- contrato de assinatura Ed25519 vinculado à composição, plano, política de intake, lote, resultado do intake e manifesto de registros;
- cadastro explícito de chaves públicas confiáveis, com identidade, papel, canal e janela de validade;
- proteção contra envelope repetido e reutilização de nonce;
- rejeição de manifesto adulterado, chave errada, identidade divergente, assinatura futura ou expirada;
- separação entre `provenance_verified` e admissão na matriz de evidências;
- política canônica com **zero signatários reais**, porque nenhuma chave operacional foi fornecida nesta fase.

## Limite de segurança

Um hash isolado comprova consistência, não autoria. A procedência só é considerada verificada quando a assinatura corresponde a uma chave pública previamente confiada. Chaves privadas não são persistidas, versionadas nem incluídas em configuração.

Mesmo após a procedência ser verificada, estes estados permanecem falsos:

- elegibilidade para a matriz;
- avaliação da matriz;
- execução de gates;
- atualização da memória de release;
- geração de pacote;
- deploy.

## Validação

```bash
npm run evolution:phase-203:assess
npm run evolution:phase-203:check
node --test tests/contracts/release-evidence-provenance.test.mjs
```

## Próxima fase

Fase 204 — contrato de admissão na matriz: transportar somente evidências cuja procedência foi verificada, mantendo gates e promoção bloqueados.
