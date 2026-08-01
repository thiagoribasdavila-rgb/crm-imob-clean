# Fase 78 — Explicabilidade preditiva operacional

## Resultado

Cada lead pode receber uma explicação determinística com probabilidade bruta, probabilidade calibrada quando aprovada, confiança, fatores positivos, riscos, sinais ausentes e próxima melhor ação.

## Experiência e governança

- Mesma explicação para o corretor e para a liderança autorizada.
- Chaves controladas traduzidas na interface; nenhum texto livre de IA.
- Validade de 24 horas para evitar orientação envelhecida.
- Custo de LLM zero, revisão humana obrigatória e nenhuma decisão automática.
- Score comercial permanece diferente da probabilidade de conversão.

## Homologação

Aplicar migrations 75–78, executar `npm run prediction-explainability:check` e comparar uma lead nova, uma avançada e uma parada. Validar atualização, expiração, modelo calibrado ativo/inativo, quatro perfis e dois tenants.
