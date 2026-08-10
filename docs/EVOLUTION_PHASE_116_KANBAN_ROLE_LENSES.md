# Fase 116 — Kanban Role Lenses

Objetivo: transformar o mesmo Kanban em uma experiência mais decisiva para cada perfil da operação.

## O que mudou

- O Pipeline agora lê o contexto autenticado salvo no shell do Atlas.
- Foi criada a lente automática, que adapta a visão ao papel comercial do usuário.
- Também existe alternância manual entre:
  - Corretor: execução diária e próxima ação.
  - Gerente: gargalos, atrasos e leads sem compromisso.
  - Diretor: forecast, valor e oportunidades de maior impacto.
- A lente escolhida fica preservada na sessão.

## Impacto operacional

O corretor não precisa interpretar o quadro inteiro para saber o que fazer. O gerente enxerga onde o time está travando. O diretor consegue olhar o funil por valor e decisão, sem excesso de ruído.

## Validação

- Check de fase: `npm run evolution:phase-116:check`
- Typecheck: obrigatório por alterar TSX.
- Lint: obrigatório por alterar interface React.

## Próxima evolução sugerida

Fase 117: ranking dinâmico de cartões por lente ativa, para que o primeiro card de cada coluna seja sempre o mais importante para o perfil atual.
