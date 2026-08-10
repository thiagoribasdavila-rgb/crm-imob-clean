# Fase 7 — Estado da revisão de aprendizado assistido

## Objetivo

Tornar visível o ciclo real de uma revisão de governança: não iniciada, em acompanhamento, encerrada com resultado ou rejeitada.

## Reaproveitamento

O estado é calculado a partir do Livro Executivo existente (`atlas_decisions`) e do identificador estável `human:assisted-interaction-learning-review`. Não existe nova tabela, automação comercial ou estado paralelo.

## Limites de segurança

- O botão apenas leva ao Livro Executivo; não confirma decisões.
- Toda decisão preserva responsável, prazo, justificativa e resultado humano.
- Uma revisão rejeitada não executa nenhuma alteração.
- Nenhuma integração, contato, campanha ou lead é atualizado por este recurso.

## Validação manual

1. Entre como gestor e abra `/decision-center`.
2. Registre a revisão de governança da captura assistida.
3. Confirme que o painel mostra **Revisão em acompanhamento**.
4. Registre o resultado observado no Livro Executivo.
5. Confirme que o painel mostra **Revisão com resultado registrado**.
