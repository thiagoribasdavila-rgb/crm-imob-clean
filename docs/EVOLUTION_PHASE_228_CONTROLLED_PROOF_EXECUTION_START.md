# Fase 228 — Controlled Proof Execution Start

## Objetivo

Registrar, de forma atômica, assinada e auditável, o início de uma única prova controlada somente após uma autorização da fase 227 estar válida, registrada, vigente e destinada ao executor exato.

Esta fase não observa a prova e não executa publicação, rede, mutação de banco, geração de pacote, build, deploy ou promoção.

## Entregas

- política canônica de início controlado;
- memória append-only para recibos de início;
- assinatura Ed25519 do executor autorizado;
- consumo único da autorização de início;
- vínculo com autorização, memória, consumo, permissão, pacote e inventário;
- rejeição de autorização vencida, executor divergente, assinatura inválida, nonce repetido e replay;
- avaliador de prontidão e verificador estrutural da fase.

## Estado canônico real

O repositório não possui executor externo real confiável nem autorização registrada. Por isso:

- executores confiáveis: `0`;
- inícios registrados: `0`;
- autorizações consumidas: `0`;
- prova iniciada: `false`;
- prova observada: `false`.

Esse estado não é falha: preserva a verdade operacional e impede que preparação seja apresentada como execução.

## Garantias

Um início válido exige simultaneamente:

1. autorização assinada e íntegra da fase 227;
2. autorização presente na memória canônica e ainda disponível;
3. validade temporal no instante do início;
4. executor e chave exatamente vinculados;
5. memória de início no head esperado;
6. identificador e nonce inéditos;
7. gravação atômica do recibo, consumindo a única autorização disponível.

O recibo comprova apenas o início. A observação permanece bloqueada para a fase 229.

## Validação

```bash
npm run evolution:phase-228:assess
npm run evolution:phase-228:check
node --test tests/contracts/controlled-proof-execution-start.test.mjs
```

## Próxima fase

Fase 229 — `Controlled Proof Execution Observation`: registrar a primeira observação interna, determinística e delimitada de uma prova já iniciada, mantendo todos os efeitos externos bloqueados.
