# Fase 37 — SLA de proposta

## Resultado

O ciclo comercial agora continua depois da aprovação humana. A proposta registra preparação, pedido de revisão, aprovação, envio ao cliente, aceite, recusa ou vencimento, preservando a simulação e sua regra de pagamento fotografada.

## Medição

São medidos tempo de preparação, tempo de revisão e tempo de resposta do cliente. O envio cria uma próxima ação limitada pela validade. Aceite, recusa e vencimento encerram o acompanhamento sem apagar o histórico.

## Proteções

O envio exige proposta aprovada e ainda válida. A resposta só pode existir depois do envio. A transição é atômica, bloqueia concorrência, respeita organização e carteira e registra timeline. Preço, estoque, regra de pagamento e aprovação humana existentes continuam obrigatórios.

## Homologação

Aplicar a migration e testar: proposta aprovada; envio; aceite; recusa; tentativa de resposta sem envio; proposta vencida; duas sessões; corretor lateral; dois tenants. Execute `npm run proposal-sla:check`.
