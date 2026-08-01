# Fase Final 8 — IA, automações e integrações

## Resultado

O Atlas agora encerra a consulta no navegador, na API e no provedor externo quando o usuário cancela ou fecha o Copilot. Isso evita processamento sem utilidade, reduz latência percebida e impede consumo desnecessário após o abandono da pergunta.

## Roteamento e continuidade

- Dados pessoais continuam restritos à rota aprovada, sem envio aos provedores econômicos ou de pesquisa.
- OpenAI, Perplexity, DeepSeek, Qwen, Kimi e GLM participam somente quando configurados e permitidos pela classe do dado.
- Falha ou timeout de um provedor aciona failover; cancelamento intencional do usuário encerra a cadeia inteira.
- O motor local seguro mantém o CRM operacional quando nenhuma IA externa responde.

## Experiência e custo

O Copilot oferece cancelamento explícito e cancela automaticamente ao fechar o painel. A resposta identifica provedor e modelo. O custo aparece como medido apenas quando os preços oficiais foram configurados; caso contrário, a interface informa que a precificação está pendente, sem inventar valores.

## Governança

Telemetria de uso, custo, rota, guardrails e fallback permanece auditável. Nenhuma recomendação da IA autoriza automaticamente orçamento, redistribuição, contato, publicação de campanha ou outra ação externa: todas mantêm aprovação humana. O ambiente alvo continua sendo a Hostinger.

## Limite desta fase

A resposta continua em JSON limitado e compatível com a infraestrutura atual. Streaming não foi ativado nesta fase porque exigiria homologação específica de proxy, timeout e desconexão na Hostinger; o cancelamento ponta a ponta entrega o ganho de custo e controle sem introduzir risco de produção.
