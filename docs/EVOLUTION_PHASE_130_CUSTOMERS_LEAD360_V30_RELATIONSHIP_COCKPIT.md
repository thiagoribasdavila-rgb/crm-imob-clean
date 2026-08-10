# Fase 130 — Clientes 360 / Lead 360 V30 Relationship Cockpit

Objetivo: transformar Clientes 360 em uma tela de decisão comercial, com menos ruído visual e mais clareza sobre o próximo atendimento.

## Problema resolvido

A tela já concentrava relacionamentos, mas ainda dependia de leitura manual da lista para entender:

- quem precisa de próxima conversa;
- quais clientes têm perfil quente;
- quais cadastros têm lacunas de contexto;
- onde a IA consegue ajudar com memória suficiente.

## Alterações realizadas

- Adicionado o `V30 RELATIONSHIP COCKPIT` na página de Clientes 360.
- Criado score de `Clareza da carteira`, derivado de contato, próxima ação, perfil comprador e contexto essencial.
- Criados quatro sinais operacionais:
  - Clareza 360;
  - Próxima conversa;
  - Perfis quentes;
  - Memória IA.
- Cada sinal abre o Copilot com contexto supervisionado, sem executar alteração automática.
- Adicionados estilos responsivos premium no padrão V30.

## Impacto operacional

O corretor passa a saber rapidamente:

- quem atender agora;
- qual informação completar antes da abordagem;
- quais clientes estão mais próximos de avanço;
- onde a memória comercial precisa melhorar para a IA ser mais assertiva.

## Segurança e governança

Esta fase não altera banco, permissões, API, Supabase, RBAC ou histórico. A IA apenas orienta; nenhuma mensagem, transferência, pontuação definitiva ou reativação é executada automaticamente.

## Validação

- `npm run evolution:phase-130:check`
- `npm run typecheck`
- `npm run lint`

## Próxima etapa recomendada

Fase 131: aplicar o mesmo padrão V30 ao Lead 360 individual, criando uma visão de atendimento com briefing, objeções, próximos passos, materiais recomendados e memória de relacionamento por cliente.
