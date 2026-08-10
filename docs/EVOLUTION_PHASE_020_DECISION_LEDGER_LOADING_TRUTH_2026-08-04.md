# Fase 20 — Estado verdadeiro na abertura do Livro Executivo

## Objetivo

Separar claramente os estados de carregamento, indisponibilidade e histórico vazio para que a diretoria não interprete uma consulta em andamento como ausência de decisões.

## Entregue

- A primeira abertura informa que as decisões estão sendo carregadas.
- Se a primeira consulta falhar, a área informa que o histórico ainda não pôde ser trazido, sem dizer que não há decisões.
- A mensagem `Nenhuma decisão humana registrada ainda` aparece somente depois de uma consulta bem-sucedida que realmente não retornou registros.
- A contagem, filtros e histórico existente continuam preservados após atualizações posteriores.

## Proteções preservadas

- Nenhuma alteração em decisões, resultados, responsáveis, prazo, banco, RLS ou autenticação.
- O estado de indisponibilidade continua oferecendo a nova tentativa segura da fase 19.

## Validação esperada

1. Abrir o Command Center com o Livro Executivo ainda sem resposta da API.
2. Confirmar o estado `Carregando decisões registradas…`.
3. Validar que o estado vazio só surge após resposta válida sem registros.
4. Simular indisponibilidade e confirmar que a interface não apresenta um falso histórico vazio.
