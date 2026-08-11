# V3000 — Fase 51: cards orientados por papel

## Objetivo

Apresentar a mesma oportunidade com a decisão adequada ao papel autenticado,
sem criar outra fonte de verdade e sem ampliar a carteira recebida pelo
navegador:

- **corretor:** execução da próxima ação na própria carteira;
- **gerente:** intervenção nas exceções da própria estrutura;
- **diretor:** impacto comercial, valor registrado e exceções comprovadas da
  organização.

## Contrato factual

A leitura utiliza somente informações estruturadas que o Pipeline já recebeu:
etapa, responsável, projeto, valor potencial, próxima ação e a objeção decisiva
da Fase 50. Ela não chama IA, não infere notas livres e não grava qualquer
alteração comercial.

O card do corretor oculta o campo de responsável porque a leitura é da própria
carteira. O card do gerente identifica o responsável apenas nas linhas que a
API autenticada e as policies permitiram retornar. O card do diretor combina o
valor potencial registrado com os agregados existentes no cabeçalho de cada
etapa; uma exceção só recebe esse nome quando há evidência factual produzida
pelos contratos anteriores.

## Segurança e visibilidade

A visibilidade continua sendo resolvida no servidor pela identidade autenticada,
organização e RLS do Supabase. O navegador não recebe uma carteira maior para
depois escondê-la.

A lente manual do Kanban serve apenas para ordenar e organizar visualmente os
cards. Ela não altera visibilidade, não muda o papel efetivo e não libera dados
de terceiros. A leitura por papel usa exclusivamente o perfil autenticado.

## Implementação

- contrato puro: `lib/atlas/role-oriented-card.ts`;
- apresentação no Pipeline: `app/(crm)/pipeline/page.tsx`;
- estilos responsivos: `app/globals.css`;
- registro verificável: `config/v3000-phase-51-role-oriented-cards.json`;
- verificação: `scripts/check-v3000-phase-51-role-oriented-cards.mjs`;
- testes: `tests/contracts/v3000-phase-51-role-oriented-cards.test.mjs`.

## Limites preservados

- nenhuma migration;
- nenhuma mutação de regra de negócio;
- nenhuma chamada de IA;
- nenhuma expansão de visibilidade no cliente;
- nenhuma alteração em autenticação, organização ou RLS.
