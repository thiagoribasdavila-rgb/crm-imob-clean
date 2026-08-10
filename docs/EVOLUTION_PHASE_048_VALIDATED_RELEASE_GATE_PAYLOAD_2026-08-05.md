# Fase 48 — payload validado no gate de liberação

## Objetivo

Garantir que o Command Center só apresente evidências e controles de autorização quando a resposta do gate estiver completa e coerente.

## Alteração aplicada

- A resposta do gate passa por validação estrutural no cliente antes da renderização.
- Status, checklist, permissões, alvo de rollback, evidência e decisão anterior precisam ter formato esperado.
- Um payload incompleto ou malformado é tratado como indisponível e não concede aparência de release autorizada.

## Impacto operacional

A Diretoria não visualiza checklist quebrado, autorização inconsistente ou informação incompleta como se fosse uma evidência válida para liberação.

## Validações

- Typecheck e lint.
- Contrato do gate atualizado para exigir as validações de payload.
- Sem alteração de banco, dados comerciais, feature flags remotas, build, ZIP ou deploy.
