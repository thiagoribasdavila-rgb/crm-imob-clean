# Fase 89 — Reativação inteligente e consentida

Uma base só segue para aprovação se possuir consentimento documentado, template aprovado, contatos elegíveis, qualidade aceitável e API oficial do WhatsApp configurada. Limite diário e intervalo são reduzidos automaticamente quando a qualidade é desconhecida ou amarela; qualidade vermelha bloqueia a operação.

A política limita a duas tentativas, exige 72 horas de intervalo, opera entre 9h e 18h em São Paulo e interrompe imediatamente por resposta, opt-out ou telefone inválido. Experiência ruim permite à lead escolher manter ou solicitar troca do corretor. A decisão e o envio continuam humanos.

## Homologação

Aplicar a migration e validar importação duplicada, telefone inválido histórico, opt-out, quatro qualidades, template inexistente, credencial ausente, aprovação, janela, espaçamento, resposta, troca de corretor e isolamento entre tenants. Usar somente números de teste autorizados.

Gate: `npm run reactivation-governance:check`.
