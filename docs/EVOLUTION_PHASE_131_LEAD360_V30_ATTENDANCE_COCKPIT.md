# Fase 131 — Lead 360 V30 Attendance Cockpit

## Objetivo

Transformar a página individual de Lead 360 em uma experiência mais direta, premium e operacional: o corretor deve abrir a lead e entender em segundos qual é a próxima melhor ação.

## Problema resolvido

A tela já tinha muitos dados úteis, mas a decisão ficava espalhada em vários blocos. Isso aumentava ruído visual e fazia o corretor procurar manualmente:

- próxima ação;
- qualidade do perfil comprador;
- imóvel/projeto mais aderente;
- memória comercial da conversa.

## O que foi implementado

- Cockpit compacto V30 logo após o topo da Lead 360.
- Score de atendimento usando prontidão, completude, score da lead e saúde da ação.
- Quatro sinais de decisão:
  - Próxima ação;
  - Perfil comprador;
  - Oferta indicada;
  - Memória comercial.
- Botões do Copilot supervisionado para preparar abordagem, pergunta, sugestão de imóvel e resumo de memória.
- Visual responsivo mais limpo, com leitura rápida e sem novos custos de IA automáticos.

## Impacto operacional

O corretor ganha uma visão parecida com um briefing executivo da lead: menos rolagem, menos dúvida e mais foco em conversão.

## Segurança e governança

- Nenhuma mensagem é enviada automaticamente.
- O Copilot opera em modo de prévia.
- A ação humana continua obrigatória.
- Não houve alteração no banco nem nas APIs.

## Validação

- `npm run evolution:phase-131:check`
- `npm run typecheck`
- `npm run lint`

## Próxima fase sugerida

Fase 132 — transformar a área de materiais/projetos indicados dentro da Lead 360 em uma recomendação acionável: “qual material enviar agora para esta lead?”.
