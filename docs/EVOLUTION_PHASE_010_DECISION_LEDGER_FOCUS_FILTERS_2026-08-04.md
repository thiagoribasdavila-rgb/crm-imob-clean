# Fase 10 — Filtros de foco do Livro Executivo

## Objetivo

Reduzir ruído para a diretoria e para a gestão, separando decisões que pedem acompanhamento agora do histórico já encerrado.

## Entrega

- Filtros locais: **Atenção agora**, **Vencidos**, **Pendentes**, **Encerrados** e **Todos**.
- A ordenação anterior continua: prazos vencidos primeiro, depois resultados pendentes e por último o histórico.
- Cada filtro usa somente o Livro Executivo já carregado dentro do escopo de organização e de função do usuário.
- O padrão inicial é **Atenção agora**, mantendo todas as decisões acessíveis em **Todos**.

## Segurança e escopo

- Nenhuma migration, chamada externa ou automação foi criada.
- Nenhuma decisão, responsável, prazo ou resultado é alterado pelos filtros.
- O controle de organização e hierarquia permanece no endpoint existente do Livro Executivo.

## Validação manual

1. Acesse `/decision-center#livro-executivo` com um usuário autorizado.
2. Registre uma decisão com prazo vencido e outra com prazo futuro.
3. Confirme que **Atenção agora** mostra ambas, **Vencidos** mostra somente a primeira e **Pendentes** somente a segunda.
4. Registre o resultado de uma decisão; confirme que ela passa para **Encerrados**.
5. Confirme que **Todos** mantém o histórico completo, sem mover ou editar registros.
