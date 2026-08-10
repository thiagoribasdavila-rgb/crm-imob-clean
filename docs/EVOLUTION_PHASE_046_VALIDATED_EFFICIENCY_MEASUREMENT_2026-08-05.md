# Fase 46 — medição operacional validada

## Objetivo

Impedir que uma resposta incompleta, corrompida ou inválida da API de eficiência seja apresentada como dado operacional real no Command Center.

## Alteração aplicada

- A tela agora valida toda a estrutura de medição antes de renderizar a comparação `Antes × depois`.
- Cohortes exigem contagem de sessões válida e métricas numéricas finitas ou explicitamente não medidas.
- Dados inválidos passam ao estado seguro de indisponibilidade, sem inventar zeros ou percentuais.
- A ação de tentar novamente permanece disponível e não altera dados comerciais.

## Impacto operacional

A Diretoria deixa de tomar decisão visual com base em uma leitura malformada. O painel só mostra eficiência quando a evidência retornada é estruturalmente confiável.

## Validação prevista

- Typecheck e lint.
- Contratos da governança de interações e do gate de release.
- O contrato existente de medição antes/depois continua cobrindo API, componente e configuração de fase.
