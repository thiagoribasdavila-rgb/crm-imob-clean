# Fase 213 — Approved Release Package Authorization

## Objetivo

Preparar uma autorização explícita, assinada e de uso único para montar um pacote somente quando existir uma aprovação final válida e já comprometida na memória canônica.

## Estado canônico

A autorização permanece indisponível. A memória aprovada está vazia e a política final não possui aprovador confiável configurado. Nessas condições, autorizar a montagem seria fabricar uma decisão que não existe.

- composição: `conversion-core-candidate`;
- aprovações comprometidas: `0`;
- autorizadores confiáveis: `0`;
- montagem autorizada: não;
- pacote gerado: não;
- build executado: não;
- deploy executado: não;
- release promovida: não.

## Garantias implementadas

- vínculo exato com o hash da memória e da entrada aprovada;
- vínculo exato com a decisão final e o ID de aprovação;
- autorização permitida apenas ao mesmo diretor que assinou a aprovação comprometida;
- assinatura Ed25519 e chave dentro da validade;
- janela máxima de emissão de 5 minutos e validade máxima de 15 minutos;
- autorização de uso único e escopo exclusivo de montagem;
- nome de ZIP seguro, sem caminho, travessia ou extensão indevida;
- motivo obrigatório;
- adulteração, expiração e assinatura inválida fecham o fluxo;
- nenhuma geração automática de pacote, build, deploy ou promoção.

## Fluxo seguro

1. A fase 212 compromete uma aprovação final verificada na memória.
2. A fase 213 seleciona exatamente essa entrada pelo hash.
3. O mesmo diretor emite uma autorização assinada e temporária.
4. A autorização apenas habilita a futura montagem isolada; não cria artefato nem executa efeitos externos.

## Validação

```bash
npm run evolution:phase-213:assess
npm run evolution:phase-213:check
node --test tests/contracts/approved-release-package-authorization.test.mjs
```

Esta fase não altera banco, Auth, RLS, ambiente externo, memória de produção ou artefatos de implantação.
