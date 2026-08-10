# Fase 13 — Janela de decisão das próximas 24 horas

## Objetivo

Antecipar compromissos que ainda não atrasaram, mas exigem atenção dentro das próximas 24 horas.

## Entrega

- Indicador **Vencem em 24h** no resumo do Livro Executivo.
- Filtro específico para decisões abertas com prazo entre agora e as próximas 24 horas.
- A fila de vencidos permanece separada; itens já vencidos não são misturados com os preventivos.

## Limites preservados

- A contagem é somente leitura da lista já autorizada para o usuário.
- Não cria alertas externos, tarefas ou mudanças de prazo.
- Não altera decisões registradas.

## Validação manual

1. Registre uma decisão com prazo para as próximas 24 horas e outra para depois desse período.
2. Confirme que apenas a primeira aparece no filtro **Vencem em 24h**.
3. Confirme que uma decisão já vencida continua apenas no filtro **Vencidos**.
