# Fase 28 — Filtros comerciais

## Resultado

A carteira de leads concentra filtros e atalhos no mesmo lugar. O corretor identifica rapidamente o que precisa fazer; gestores filtram apenas pessoas e equipes permitidas pela hierarquia.

## Filtros entregues

- atalhos de um toque: ações atrasadas, sem próxima ação, leads quentes e sem responsável;
- origem, projeto, status, score e responsável;
- agenda de hoje, próximos sete dias ou qualquer ação futura;
- limpeza única dos filtros e contagem da base filtrada;
- contexto dos filtros enviado ao copiloto para análise da carteira.

O projeto é filtrado diretamente pelo vínculo canônico da lead. Campanhas continuam sendo exibidas como contexto, mas não determinam mais se uma lead pertence ao projeto filtrado.

## Segurança e hierarquia

Toda consulta passa pelo contexto autenticado, organização atual e RLS. O endpoint valida UUIDs, bloqueia gerente ou corretor fora do escopo e mantém o corretor restrito à própria carteira. Filtros nunca ampliam visibilidade.

## Homologação

1. Entrar como corretor e confirmar que os atalhos afetam somente sua carteira.
2. Entrar como gerente e filtrar cada corretor do time.
3. Entrar como diretor e filtrar projeto, origem e responsável.
4. Conferir ações atrasadas, hoje, sete dias, futuras e sem ação com datas conhecidas.
5. Confirmar que projeto sem campanha ainda aparece no filtro correto.
6. Executar `npm run commercial-filters:check`.

Pendências externas: conferir datas no fuso oficial da operação, variedade real de origens e isolamento com dois tenants.
