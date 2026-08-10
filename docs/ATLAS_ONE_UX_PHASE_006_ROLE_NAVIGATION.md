# Atlas One — Fase 6: navegação inicial por papel

## Resultado

A barra lateral deixou de apresentar a mesma sequência para todos. Cada papel inicia por uma seção curta, orientada ao trabalho que precisa executar ou decidir:

- **Corretor:** Command Center, Leads, Pipeline, Tarefas e Agenda.
- **Gerente:** Command Center, Distribuição, Corretores, Pipeline e Relatórios.
- **Superintendente:** Command Center, Relatórios, Distribuição, Corretores e Vendas.
- **Diretor:** Command Center, Relatórios, Vendas, Revenue Engine e Integrações.

O dock móvel usa os quatro destinos mais importantes de cada rotina. Administrador recebe a visão executiva; identidade desconhecida recebe a visão mais restritiva de Corretor.

## O que foi preservado

- todas as rotas permitidas continuam nos grupos canônicos;
- busca por tela continua consultando o conjunto completo permitido;
- favoritos continuam pessoais e persistidos localmente;
- permissões continuam definidas pelo RBAC existente;
- ações contextuais e links profundos não foram alterados;
- nenhuma rota, tabela, policy, usuário ou integração foi criada ou removida.

## Critério verificável

Cada papel recebe cinco destinos na barra lateral e quatro no dock móvel, sem duplicidade e somente dentro do escopo permitido. O teste contratual valida também o fallback de menor privilégio.

```bash
npm run ux:phase-006:check
node --experimental-strip-types --test tests/contracts/role-navigation-priority.test.mjs
```
