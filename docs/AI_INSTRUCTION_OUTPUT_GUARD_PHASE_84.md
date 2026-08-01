# Fase 84 — Guardrails de instrução e saída

Todas as chamadas que passam pelo roteador central são inspecionadas antes do provedor e novamente antes de entregar a resposta. Tentativas de ignorar regras, extrair segredos, elevar ferramentas ou executar ações externas são bloqueadas. Segredos aparentes e alegações comerciais inseguras são removidos ou marcados para validação.

A auditoria guarda somente códigos de risco, nível, provedor, modelo e decisão. Prompt, resposta, segredo e dados do cliente nunca são persistidos nessa tabela. Contexto do CRM é tratado como dado não confiável e não pode substituir instruções do sistema.

## Homologação

Aplicar a migration, abrir `/settings/ai-guardrails` e testar entradas normais, manipulação de instruções, solicitação de chave, comando de envio e respostas com garantia indevida. Confirmar bloqueio anterior ao provedor, sanitização, revisão humana, RLS da gestão e isolamento entre dois tenants.

Gate local: `npm run ai-guardrails:check`.
