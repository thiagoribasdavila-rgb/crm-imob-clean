# V3000 — Fase 56: homologação comercial e gate de release

## Objetivo

Fechar o ciclo das fases 37–56 com uma decisão de release verificável. A
compilação é necessária, mas não suficiente: a promoção exige regressão sem P0
ou P1, prova técnica, jornadas desktop e mobile e aprovação explícita de
diretor, gerente e corretor.

## Três resultados possíveis

- `passed`: todos os gates automatizados passaram e os três papéis aprovaram;
- `pending-human`: não há falha crítica, mas falta ambiente autenticado ou
  aprovação humana;
- `blocked`: existe P0/P1, gate automatizado falhou ou um papel rejeitou.

Somente `passed` permite promover a release. `pending-human` pode gerar um ZIP
candidato tecnicamente validado, nunca um pacote rotulado como homologado.

## Gates automatizados

O registro em `config/v3000-phase-56-commercial-homologation.json` exige:

1. contratos completos (`npm test`);
2. TypeScript (`npm run typecheck`);
3. ESLint (`npm run lint`);
4. build de produção (`npm run build`);
5. smoke do servidor compilado (`npm run smoke:v3`);
6. contrato RBAC (`npm run auth-rbac:check`);
7. isolamento por organização;
8. jornada autenticada em Chromium desktop;
9. a mesma jornada em viewport mobile;
10. instalação limpa e novo build a partir do ZIP extraído.

As jornadas autenticadas cobrem ADMIN, DIRETOR, GERENTE e CORRETOR em login,
contexto de organização e módulos centrais. As credenciais devem existir apenas
em `.env.local` ou no ambiente seguro do executor. Nomes esperados:

- `ATLAS_E2E_ADMIN_EMAIL` e `ATLAS_E2E_ADMIN_PASSWORD`;
- `ATLAS_E2E_DIRECTOR_EMAIL` e `ATLAS_E2E_DIRECTOR_PASSWORD`;
- `ATLAS_E2E_MANAGER_EMAIL` e `ATLAS_E2E_MANAGER_PASSWORD`;
- `ATLAS_E2E_BROKER_EMAIL` e `ATLAS_E2E_BROKER_PASSWORD`.

Nenhum valor secreto deve entrar no Git, no relatório ou no ZIP.

## Prova comercial controlada

Diretor, gerente e corretor devem validar em cenário controlado:

- prioridade compreensível e ação principal inequívoca;
- movimentação do lead persistida após recarregar a página;
- próxima ação e prazo preservados no banco;
- métricas sem duplicidade após atualização;
- isolamento da organização e visibilidade correta por papel;
- experiência utilizável em desktop e mobile.

A aprovação deve atualizar
`docs/evidence/V3000_PHASE_56_RELEASE_GATE.json`. A ausência de credenciais ou
assinatura permanece como pendência explícita; não é convertida em aprovação.

## Estado desta execução

Em 11/08/2026, contratos, TypeScript, ESLint, build de produção, smoke do
servidor compilado, RBAC e isolamento por organização passaram. A prova de
isolamento incluiu `rls:check`, matriz dinâmica `22/22` e os 20 controles de
provisionamento multi-tenant. O smoke confirmou health e login públicos, além
dos redirects de proteção; o readiness permaneceu indisponível como esperado
porque este executor não contém as variáveis do Supabase.

O ambiente local também não contém as contas E2E dos quatro perfis. Por isso,
desktop/mobile autenticados e aprovação humana continuam pendentes. A decisão
permanece `pending-human` e `releaseAllowed: false`: o artefato desta execução é
um candidato tecnicamente validado, não uma promoção para produção.

O ZIP candidato também passou por extração em diretório temporário, instalação
limpa com `npm ci` e nova compilação integral. O ensaio usou o ambiente local
configurado sem empacotar segredos e confirmou novamente a presença das
dependências de Tailwind/PostCSS no manifesto e no lockfile. Conectividade com
serviços externos não foi inferida a partir desse build e segue fora desta
aprovação técnica.

## Validação pública do ambiente publicado

Na continuação da fase, em 11/08/2026, o domínio
`https://atlasaios.com.br` foi verificado sem sessão autenticada:

- `/` e `/login` responderam `200`;
- `/api/health` respondeu `200` com a aplicação saudável;
- `/api/ready` respondeu `200`, banco pronto e latência observada de `78 ms`;
- `/reports`, `/dashboard` e `/pipeline` responderam `307` para o login,
  preservando o destino original no parâmetro `next`.

Essa prova confirma disponibilidade pública, prontidão do banco remoto e
proteção anônima das rotas comerciais. Ela não substitui a jornada autenticada
por papel e não altera o estado `pending-human` do gate.

Esta fase não cria migration, dado fictício, chamada de IA, expansão de
visibilidade nem promoção automática para produção.
