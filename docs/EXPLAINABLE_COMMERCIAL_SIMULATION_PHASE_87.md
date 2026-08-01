# Fase 87 — Assistente de simulação comercial

O corretor compara regra padrão, entrada maior e prazo menor. Todo cenário parte de unidade disponível, pacote comercial ativo e regra vigente. Parâmetros personalizados só podem ser mais conservadores e permanecer dentro dos limites aprovados.

Cada resultado fotografa versões da regra e do pacote comercial, fórmula, premissas, validade e evento de auditoria. Simulação não é proposta, não aprova crédito e não pode ser enviada como compromisso sem reconfirmação e revisão humana.

## Homologação

Aplicar a migration e testar unidade indisponível, pacote vencido, regra vencida, três cenários, limites, comparação, validade de 24 horas, alteração posterior de preço, pedido de proposta, aprovação e isolamento entre tenants.

Gate: `npm run commercial-simulation:check`.
