# Fase 47 — proteção de sessão no gate de liberação

## Objetivo

Evitar que uma sessão expirada seja confundida com falha técnica ao consultar ou registrar uma decisão de liberação do redesign.

## Alteração aplicada

- O gate agora identifica explicitamente a ausência de sessão durante a leitura.
- O aviso explica quando é necessário entrar novamente, sem sugerir que o gate ou a release foram alterados.
- Aprovação e rollback deixam de enviar requisição quando não há token de sessão válido.
- Nenhuma decisão é persistida em caso de sessão expirada.

## Impacto operacional

A Diretoria recebe orientação acionável e não corre o risco de interpretar uma falha de autenticação como indisponibilidade das evidências ou como decisão registrada.

## Validações

- Typecheck e lint.
- Contratos de governança de interação e gate de release.
- Sem alteração de banco, feature flags remotas, build, ZIP ou deploy.
