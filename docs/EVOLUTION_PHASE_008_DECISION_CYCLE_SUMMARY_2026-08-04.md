# Fase 8 — Resumo do ciclo de decisão

## Objetivo

Dar à liderança uma leitura curta dos últimos sete dias: decisões registradas, resultados pendentes, prazos vencidos e ciclos encerrados.

## Base reaproveitada

O resumo é calculado no navegador a partir do Livro Executivo já existente (`atlas_decisions`) e dentro do escopo que a API já entrega para cada cargo. Não há tabela, API, migration, automação ou dado paralelo novo.

## Limites de segurança

- Os números não alteram responsável, prazo, lead, campanha ou etapa comercial.
- “Pendente” exclui decisões humanas rejeitadas.
- “Vencido” usa somente o prazo já registrado e nunca muda o status do item.
- A confirmação de um resultado continua sendo manual, no Livro Executivo.

## Validação manual

1. Abra `/decision-center` como liderança.
2. Confira o bloco **Resumo semanal do ciclo de decisão**.
3. Registre uma decisão com prazo futuro: ela entra em resultados pendentes.
4. Registre um resultado: ela deixa os pendentes e entra em ciclos encerrados quando estiver dentro de sete dias.
5. Um prazo passado sem resultado aparece em prazos vencidos, sem disparar qualquer ação automática.
