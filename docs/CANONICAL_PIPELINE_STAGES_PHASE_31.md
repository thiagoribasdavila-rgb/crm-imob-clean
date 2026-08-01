# Fase 31 — Etapas canônicas

## Resultado

CRM, Kanban, forecast, análises, IA e Meta passam a usar nove chaves canônicas. A empresa pode personalizar rótulo, probabilidade, ordem e visibilidade, mas não muda a chave nem o significado do resultado.

## Etapas

Novo, contato, qualificação, visita, proposta, contrato, ganho, perdido e comprou em outro lugar. Valores históricos como negociação, vendido, won e lost são normalizados na entrada, sem criar colunas duplicadas.

## Governança

- diretor, administrador e superintendente podem configurar apresentação;
- corretor e gerente apenas utilizam o funil;
- configuração pertence à organização e possui RLS;
- probabilidade alimenta forecast, mas não declara venda;
- ganho, perda e comprador externo preservam resultados distintos.

## Homologação

Aplicar a migration, editar rótulo/probabilidade/ordem/visibilidade, recarregar o Kanban, mover uma lead por todas as etapas e reconciliar contagens com relatórios. Repetir em dois tenants e confirmar que uma configuração não atravessa organizações.

Execute `npm run canonical-stages:check`. A migration e o teste de isolamento real permanecem obrigatórios antes da produção.
