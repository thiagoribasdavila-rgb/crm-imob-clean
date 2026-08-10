# Fase 50 — segurança de navegação no gate

## Objetivo

Impedir que uma requisição em andamento tente atualizar o gate depois que o usuário sair do Command Center.

## Alteração aplicada

- O componente acompanha se ainda está montado na tela.
- Respostas que chegam após uma troca de rota são descartadas.
- A proteção de atualidade da leitura continua ativa em conjunto com a proteção de desmontagem.

## Impacto operacional

A navegação do gestor permanece previsível, mesmo quando há conexão lenta ou uma atualização pendente do gate.

## Validações

- Typecheck e lint.
- Contratos de governança, medição antes/depois e gate de release.
- Sem alteração de banco, dados comerciais, feature flags remotas, build, ZIP ou deploy.
