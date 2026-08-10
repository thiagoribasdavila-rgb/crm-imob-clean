# Atlas One — Fase 60: gate de liberação e rollback

## Resultado

O redesign operacional encerra o ciclo de 60 fases com um gate factual no Centro de Decisão. A liberação não ocorre por aparência nem por presença de código: exige amostra comparável da Fase 59, ausência de regressão observada em erros, cliques e conclusão, qualidade humana média mínima e aceite explícito da Diretoria.

## Governança

- Fonte de evidência: `atlas_events`, sem conteúdo pessoal no payload de telemetria.
- Estado do gate: `feature_flags`, chave `operational_ux_v30`, isolada por organização.
- Leitura: Diretor, superintendente e gerente.
- Decisão: Diretor, diretor decisor ou administrador.
- Aprovação: checklist completo, utilidade 4/5 ou 5/5 e justificativa.
- Rollback: sempre disponível à Diretoria, com justificativa e alvo `atlas-v3-operational-safe`.
- Sem causalidade: a comparação é observacional e o texto do produto declara essa limitação.

## Checklist operacional

1. Dez sessões antes e dez depois.
2. Erros sem regressão observada.
3. Cliques sem regressão observada.
4. Conclusão sem regressão observada.
5. Qualidade média das decisões de pelo menos 4/5.
6. Revisão e aceite explícitos do Diretor.

## Limite desta entrega

A fase não executa build, não gera ZIP, não publica e não modifica o banco remoto. Ela entrega o mecanismo seguro que autoriza uma próxima release ou registra rollback quando usado por um Diretor autenticado no ambiente instalado.
