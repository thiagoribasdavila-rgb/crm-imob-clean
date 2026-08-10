# Fase 229 — Controlled Proof Execution Observation

## Objetivo

Registrar, de forma interna, atômica, assinada e auditável, uma única observação de uma prova controlada já iniciada. A observação confirma somente o início registrado e não autoriza a continuação da prova.

Esta fase não acessa rede, não altera banco ou autenticação e não executa publicação, geração de pacote, build, deploy ou promoção.

## Entregas

- política canônica de observação controlada;
- memória append-only de observações;
- assinatura Ed25519 por observador independente;
- vínculo exato com recibo e memória do início, autorização, permissão, pacote e inventário;
- janela determinística de observação de 300 segundos;
- bloqueio de repetição por início, identificador e nonce;
- avaliador de prontidão e verificador estrutural da fase.

## Estado canônico real

O repositório não possui início real registrado nem observador real confiável configurado. Por isso:

- observadores confiáveis: `0`;
- inícios registrados: `0`;
- observações registradas: `0`;
- prova observada: `false`;
- prova continuada: `false`.

Esse estado preserva a verdade operacional: o contrato está implementado e testado, mas nenhuma execução real é inventada.

## Garantias

Uma observação válida exige simultaneamente:

1. política e memória de início íntegras;
2. recibo de início assinado e presente na memória canônica;
3. observador ativo, confiável e independente do executor;
4. observação dentro da janela delimitada;
5. vínculo exato com início, autorização, permissão, pacote e inventário;
6. head da memória esperado, identificador e nonce inéditos;
7. gravação atômica de um único recibo assinado por início.

O recibo comprova somente a observação. A continuação permanece bloqueada para uma autorização explícita da fase 230.

## Validação

```bash
npm run evolution:phase-229:assess
npm run evolution:phase-229:check
node --test tests/contracts/controlled-proof-execution-observation.test.mjs
```

## Próxima fase

Fase 230 — `Controlled Proof Execution Continuation Authorization`: autorizar explicitamente, de forma assinada e de uso único, a continuação de uma prova já observada, mantendo todos os efeitos externos bloqueados.
