# ATLAS AI OS — Fase 39/100

## Objetivo

Preparar o contrato governado de replay em staging isolado, sem acessar ou alterar qualquer ambiente remoto.

Esta entrega cria somente o validador e o construtor offline do contrato. Nenhuma evidência real foi recebida, nenhum contrato foi emitido e nenhum replay foi executado.

## Quatro provas obrigatórias

O contrato exige quatro arquivos sanitizados, dentro do workspace e com permissão `0600`:

1. projeção real da Fase 38 com **8 de 15 controles (53%)**;
2. manifesto de um staging isolado, separado e descartável;
3. plano de rollback revisado;
4. aprovação humana explícita e limitada a `APPROVE_CONTRACT_ONLY`.

Os fingerprints da projeção, do alvo e do rollback precisam corresponder exatamente aos registrados na aprovação. A aprovação expira em no máximo 24 horas e não pode autorizar execução, produção ou Meta.

## Requisitos do staging isolado

- projeto separado da produção;
- alvo descartável com prazo máximo de 24 horas;
- ausência de dados de produção;
- dados sanitizados somente;
- Auth, Storage e Realtime isolados;
- nenhuma credencial persistida no manifesto;
- destruição obrigatória depois do replay.

## Roteiro preparado

O contrato ordena: validação dos fingerprints, snapshot pré-replay, migrations com interrupção na primeira falha, lint, pgTAP com testes negativos de RLS, verificação de Auth/Storage/Realtime/Data API, baseline de desempenho, Security e Performance Advisors, rollback seco, conciliação das evidências e destruição do alvo.

Esse roteiro é uma especificação. A Fase 39 não executa nenhum desses passos.

## Separação das aprovações

A autorização desta fase serve apenas para preparar o contrato. Mesmo um contrato aprovado mantém:

- `replayExecutionAllowed: false`;
- `stagingMigrationAllowed: false`;
- `productionMigrationAllowed: false`;
- `metaDeliveryAllowed: false`;
- `buildAllowed: false`.

A execução futura exigirá uma nova decisão humana exclusiva, credenciais fornecidas por canal seguro e uma janela operacional autorizada.

## Estado desta entrega

- contrato estático e testes negativos: preparados;
- projeção real 8/15 recebida: não;
- alvo real de staging identificado: não;
- rollback real recebido: não;
- aprovação humana real recebida: não;
- contrato foi construído: não;
- replay foi executado: não;
- banco, Docker, staging, produção ou Meta tocados: não;
- build executado: não.

## Referências oficiais

- [Managing Environments](https://supabase.com/docs/guides/deployment/managing-environments)
- [Deployment & Branching](https://supabase.com/docs/guides/deployment)
- [Testing Overview](https://supabase.com/docs/guides/local-development/testing/overview)
- [Performance and Security Advisors](https://supabase.com/docs/guides/database/database-advisors)
- [Supabase Changelog](https://supabase.com/changelog)

A documentação atual recomenda ambientes separados para desenvolvimento, staging e produção. Branches de preview são isoladas e não recebem dados de produção automaticamente. Testes de banco devem cobrir RLS, papéis e casos negativos; os Advisors verificam, entre outros pontos, RLS, índices e funções privilegiadas.

## Próxima fase

A Fase 40 preparará o executor de replay em staging isolado. Ele continuará bloqueado até existir contrato real da Fase 39, credenciais seguras fora dos artefatos, nova aprovação humana específica para execução e janela operacional autorizada.
