# Fase 85 — Playbooks imobiliários versionados

O Copiloto seleciona automaticamente um playbook para abordagem, qualificação, apresentação, simulação, visita, proposta, fechamento ou reativação. Cada playbook limita a IA a objetivo, perguntas, ações, critérios de avanço e proibições estruturadas.

O padrão Atlas funciona sem configuração. A diretoria pode publicar uma versão para toda a operação ou uma substituição específica por incorporadora. Uma publicação aposenta a versão ativa anterior, preserva o histórico e nunca autoriza ação externa ou decisão automática.

## Homologação

Aplicar a migration, abrir `/settings/ai-playbooks`, publicar versões de operação e incorporadora e confirmar: prioridade da incorporadora, fallback Atlas, troca de etapa, histórico preservado, diretor como único publicador, leitura da superintendência e isolamento entre tenants.

Gate: `npm run ai-playbooks:check`.
