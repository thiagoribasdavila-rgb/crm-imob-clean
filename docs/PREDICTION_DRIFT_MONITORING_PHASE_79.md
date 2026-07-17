# Fase 79 — Monitoramento de drift e qualidade

## Resultado

O monitor compara a janela atual com o período imediatamente anterior. Mede mudança na distribuição das probabilidades (PSI), score médio, conversão observada e degradação do Brier Score.

## Limites

- Cada janela exige 100 fotografias atuais e 100 de baseline.
- PSI a partir de 0,10 pede atenção e 0,25 gera alerta.
- Aumento do Brier em 0,02 pede atenção e 0,05 gera alerta.
- Relatórios são imutáveis e não acionam rollback, campanhas ou decisões sobre pessoas.

## Homologação

Aplicar migrations 75–79, executar `npm run prediction-drift:check`, gerar relatórios de 30, 60 e 90 dias e validar amostra insuficiente, estabilidade, atenção e alerta. Conferir diretoria, superintendência e dois tenants.
