# Fase 11 — Próxima decisão executiva

## Objetivo

Transformar o Livro Executivo em uma orientação curta: indicar qual compromisso humano merece atenção antes de navegar pelo histórico.

## Entrega

- Um resumo único da próxima decisão aberta, derivado da ordenação já existente.
- Destaque para prazo vencido ou resultado pendente.
- Responsável e prazo aparecem no próprio resumo.
- O botão **Ver no livro** apenas troca o filtro local e leva à lista correspondente.
- Quando não há pendências, o Atlas confirma o ciclo limpo sem esconder o histórico.

## Limites preservados

- Sem nova tarefa, automação, notificação externa ou alteração de registros.
- Sem migration nem alteração de RLS.
- A fonte continua sendo o Livro Executivo já filtrado por organização e cargo no servidor.

## Validação manual

1. Registre duas decisões abertas, uma vencida e outra futura.
2. Confirme que o resumo apresenta a vencida.
3. Clique em **Ver no livro** e valide o filtro correspondente.
4. Registre o resultado de todas as pendências e confirme o estado sem pendências.
