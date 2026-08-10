# Fase 154 — Meta Director Campaign Conversion Center

## Objetivo

Evoluir a área de campanhas para uma tela de decisão comercial focada no diretor: criar campanha com briefing claro, qualificar campanha e cliente, acompanhar conversão real e orientar quais campanhas Meta devem ser corrigidas, mantidas ou analisadas para escala.

## Problema resolvido

A estrutura de Meta/Andromeda já tinha inteligência técnica em integrações e relatórios, mas a entrada de campanhas ainda era simples demais para a operação. O diretor precisava de uma tela menos técnica e mais decisiva.

## Alterações realizadas

- A página `app/(crm)/marketing/campaigns/page.tsx` foi redesenhada como central executiva.
- A tela agora consulta `/api/v1/campaign-intelligence` por período de 7, 30 e 90 dias.
- Foi criado um briefing de campanha para orientar:
  - projeto;
  - perfil comprador;
  - ângulo da oferta;
  - etapa do funil;
  - evento de otimização.
- Foram adicionadas métricas executivas:
  - leads no CRM;
  - qualificados;
  - visitas;
  - propostas;
  - vendas;
  - ROAS.
- A tela inclui fila de decisões do diretor, gates de qualidade e ranking de campanhas por conversão.

## Impacto operacional

O Atlas passa a orientar campanhas Meta pelo que realmente melhora venda: qualidade do lead, visita, proposta e venda confirmada no CRM. Isso reduz ruído, evita escalar campanhas por volume vazio e prepara o loop de aprendizado para Andromeda.

## Segurança e governança

- Nenhuma campanha é alterada automaticamente.
- Nenhuma verba é escalada pela IA.
- Nenhuma migration ou alteração de banco foi criada.
- Quando a API de campanhas não estiver disponível, a tela entra em modo planejamento sem quebrar a experiência.

## Checklist de validação

- `npm run evolution:phase-154:check`
- `npm run typecheck`
- `npm run lint`

## Próxima etapa recomendada

Conectar essa experiência com ações salvas no banco: rascunho de campanha, aprovação de briefing, checklist de publicação no Meta e registro de teste real de lead.
