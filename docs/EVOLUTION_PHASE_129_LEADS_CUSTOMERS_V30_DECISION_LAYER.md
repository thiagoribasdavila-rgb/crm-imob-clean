# Fase 129 — Leads/Clientes V30 Decision Layer

## Objetivo

Transformar a tela de Leads em uma mesa de decisão mais objetiva: o usuário não deve apenas ver contatos, mas entender qual ação comercial aumenta a chance de venda agora.

## Problema resolvido

A carteira já tinha filtros, métricas e fila de prioridade, mas ainda exigia leitura demais para responder perguntas simples:

- qual lead exige ação imediata?
- a carteira está com próxima ação suficiente?
- quais sinais ajudam a IA e o Meta a aprender?
- o corretor deve ligar, qualificar, distribuir ou pedir ajuda ao Copilot?

## Alterações realizadas

- Criado o cálculo `leadsV30Signals`.
- Adicionado `data-v30-phase="129-leads-customers-v30-decision-layer"` na tela de Leads.
- Criada a seção `atlas-leads-v30-command-strip`.
- Incluídos quatro sinais compactos:
  - SLA;
  - intenção;
  - cobertura de próxima ação;
  - memória IA.
- Adicionado score de clareza da carteira.
- Conectados diagnósticos ao Copilot via `atlas:open-copilot`.
- Criados estilos responsivos e premium no padrão V30.

## Impacto operacional

- Corretor entende a próxima ação com menos esforço.
- Gerente/diretor visualizam gargalo de atendimento e qualidade de carteira.
- Copilot recebe contexto mais organizado para sugerir abordagem e rotina.
- O CRM fica mais proativo sem automatizar decisões sensíveis.

## Riscos

- A fase depende dos dados já retornados pela API de Leads.
- O score de clareza é operacional e explicável, não deve ser tratado como previsão estatística final.
- A memória Meta depende de sinais autorizados e consentimento registrado.

## Checklist de validação

- `npm run evolution:phase-129:check`
- `npm run typecheck`
- `npm run lint`

## Próxima etapa recomendada

Fase 130: aplicar a mesma filosofia V30 no Clientes 360/Lead 360, aproximando histórico, perfil, intenção e próxima ação em uma visão única de atendimento.
