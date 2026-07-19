# Fase Final 9 — Confiabilidade, desempenho e homologação

## Resultado

O gate de confiabilidade passou a tratar ausência de evidência como bloqueio crítico. Erros ao consultar fila, dead letters, uso de IA, organização ou restauração não podem mais virar zero e produzir um falso estado saudável.

## Eficiência do banco

- A contagem da fila é feita sem transferir seus registros.
- A idade usa somente o item pendente mais antigo, em vez de carregar até dez mil linhas.
- A latência de IA considera as cinco mil execuções mais recentes da janela e informa amostra e população.
- Os índices da Fase 98 continuam atendendo organização, status e data.

## Homologação real obrigatória

Antes do GO executivo, validar quatro perfis, dois tenants, viewport de 390 px, restauração de backup, rollback da última versão V3, HTTPS, workers e integrações reais. Nenhuma dessas evidências é criada artificialmente pelo código.

## Compatibilidade Supabase em julho de 2026

Confirmar no painel que o projeto usa PostgreSQL 17 ou superior. Projetos antigos em PostgreSQL 14 perderam suporte em 1º de julho de 2026. Antes de qualquer upgrade, verificar e remover ou migrar as extensões incompatíveis `timescaledb`, `plv8`, `pls`, `plcoffee` e `pgjwt`. Também confirmar que tabelas novas necessárias ao Data API possuem grants explícitos e RLS, porque novos projetos podem não expô-las automaticamente.

## Limite da conclusão

A engenharia local está concluída. Restauração, rollback, isolamento real entre tenants e smoke HTTPS precisam ser executados no ambiente de homologação; até lá, o sistema permanece candidato e não produção.
