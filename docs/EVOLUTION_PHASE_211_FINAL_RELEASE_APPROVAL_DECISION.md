# Fase 211 — Final Release Approval Decision

## Objetivo

Consumir exclusivamente uma adjudicação assinada e integralmente aceita da fase 210 para registrar uma decisão humana final, independente e verificável sobre a release.

## Contrato entregue

- vínculo criptográfico com um único `adjudicationRegisterHash`;
- aprovação permitida somente quando todos os resultados dos gates foram aceitos;
- decisão explícita entre `approved` e `rejected`, com motivo governado;
- aprovador final Ed25519 confiável, ativo e diferente dos autorizadores, executores e adjudicadores anteriores;
- decisão final assinada, verificável e resistente a adulteração;
- rejeição permanece fail-closed;
- aprovação válida ainda não atualiza memória, não gera pacote, não executa deploy e não promove release.

## Estado canônico

Nenhum aprovador final real foi inventado e nenhum registro real de adjudicação está disponível no repositório. Portanto, a prontidão permanece bloqueada em `awaiting_trusted_final_release_approver_configuration`.

O bloqueio é deliberado: a fase prova o contrato local de decisão final, sem alegar homologação de runtime ou autorização operacional inexistente.

## Fluxo explícito

1. configurar um aprovador final confiável e independente;
2. verificar o registro assinado de adjudicação da fase 210;
3. rejeitar a release se qualquer resultado não tiver sido aceito;
4. assinar a decisão final dentro da janela permitida;
5. validar assinatura, conteúdo e hashes;
6. somente a fase 212 poderá registrar uma aprovação válida na memória imutável de release.

## Validação

```bash
npm run evolution:phase-211:assess
npm run evolution:phase-211:check
node --test tests/contracts/final-release-approval-decision.test.mjs
```

## Limites

Esta fase não acessa banco, não altera Auth ou RLS, não chama serviços externos, não roda build, não atualiza memória de release, não gera ZIP e não realiza deploy ou promoção.
