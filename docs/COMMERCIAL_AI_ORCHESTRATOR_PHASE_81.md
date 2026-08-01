# Fase 81 — Orquestrador comercial de IA

## Resultado

Todas as chamadas do `generateAIText` passam por uma política única que classifica tarefa, dados e risco antes de escolher provedores. A decisão registra rota, orçamento, provedor final, tokens, custo, latência, fallback e revisão humana, sem salvar prompt ou resposta.

## Política

- Dados pessoais: somente OpenAI ou fallback local.
- Pesquisa pública: Perplexity com fontes ou aviso local sem alegar evidência.
- Conteúdo sem PII: provedores econômicos podem participar do failover.
- Risco alto e contexto pessoal exigem revisão humana.
- Nenhuma chamada de texto recebe autorização para executar ações externas.
- Orçamentos: 600, 1.200 ou 2.400 tokens conforme complexidade; pesquisa 1.200.

## Homologação

Aplicar a migration, executar `npm run ai-orchestrator:check`, simular quatro tarefas com e sem dados pessoais e depois testar provedores reais. Conferir ordem, fallback, custos configurados, auditoria e isolamento entre tenants na Hostinger.
