# Atlas One — Fase 25 — Prontidão mínima para avançar

## Objetivo

Explicar ao corretor quais dados mínimos já foram confirmados e qual é a próxima lacuna que deve ser resolvida antes de avançar a conversa comercial.

## Alterações

- A antiga porcentagem isolada de prontidão ganhou seis requisitos verificáveis.
- Contato, projeto, investimento, região, tipologia e continuidade aparecem em uma leitura compacta.
- O primeiro requisito ausente oferece uma ação direta para o campo ou fluxo canônico.
- A cobertura ampliada do perfil permanece como contexto secundário.
- O indicador não move, impede ou libera etapas automaticamente.

## Impacto operacional

- O corretor entende por que a lead ainda não está pronta para uma recomendação consistente.
- A próxima pergunta ou ação deixa de depender de interpretação de uma porcentagem opaca.
- O gestor mantém liberdade comercial; a tela orienta sem transformar ausência de dado em punição.

## Fontes preservadas

- perfil da lead;
- projeto vinculado;
- próxima ação;
- tarefas abertas;
- cobertura ampliada já calculada localmente.

## Limites da fase

Não houve alteração em Supabase, migrations, APIs, RLS, autenticação, RBAC, automações, movimentação do funil, dados reais ou pacote de release.

## Validação

```bash
npm run ux:phase-025:check
node --test tests/contracts/minimum-advance-readiness.test.mjs
npm test
npm run typecheck
npm run lint
```
