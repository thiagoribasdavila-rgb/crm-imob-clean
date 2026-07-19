# Fase 90 — Copiloto noturno governado

Entre 20h e 22h59 em São Paulo, o Atlas pode preparar uma abordagem oficial após validar consentimento atual, opt-out, corretor responsável, projeto, materiais, template aprovado e credenciais da API oficial. Toda mensagem entra em aprovação humana.

A automação termina na qualificação. Simulação é somente rascunho; proposta, desconto, crédito, compromisso, negociação e envio permanecem bloqueados. Ao receber resposta, a conversa volta ao corretor exclusivo. Entre 7h e 11h59, um resumo estruturado mostra estágio, qualificação, simulação e próxima decisão.

## Homologação

Aplicar a migration e testar fora/dentro da janela, consentimento, opt-out, template, materiais, duplicidade, aprovação, resposta, transferência de corretor, handoff da manhã e isolamento entre tenants. Usar somente número autorizado.

Gates: `npm run nightly-copilot:check` e `npm run api-security:check`.
