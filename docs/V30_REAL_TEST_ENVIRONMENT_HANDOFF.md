# ATLAS V30 — entrega do ambiente para teste real

**Data:** 23/07/2026  
**Estado:** código local aprovado; ambiente real ainda pendente

## Resultado atual

O V30 concluiu tudo que pode ser provado sem credenciais e sem modificar a
infraestrutura externa:

- 26 de 28 fases anteriores ao build aprovadas: **92,9%**;
- 26 de 30 fases totais aprovadas: **86,7%**;
- 94 gates únicos avaliados;
- 88 gates executados com sucesso;
- zero falha de código;
- Node.js 24, Playwright 1.61.1 e Chromium preparados;
- build final e ZIP ainda bloqueados corretamente.

Restam somente:

1. fase 27 — jornadas autenticadas no ambiente real;
2. fase 28 — segurança, carga, backup e restauração;
3. fase 29 — build único e novo ZIP;
4. fase 30 — implantação Hostinger e aceite humano.

## Regra de segurança

Os valores devem ser preenchidos diretamente no `.env.local` do computador de
homologação ou no painel seguro da Hostinger.

O modelo completo e sem segredos está em `.env.homologation.example`. Ele já
inclui Supabase, cron, OpenAI e as quatro contas sintéticas de RBAC necessárias
ao E2E.

Nunca enviar:

- senha;
- service role;
- token Meta;
- token WhatsApp;
- chave de IA;
- `DATABASE_URL`;
- conteúdo do `.env.local`;
- dados pessoais de leads.

## Caminho A — testar o site já publicado

É o caminho mais rápido para validar a experiência real. Preencha no
`.env.local`:

```text
ATLAS_E2E_BASE_URL=https://dominio-real-de-homologacao

ATLAS_E2E_ADMIN_EMAIL=
ATLAS_E2E_ADMIN_PASSWORD=
ATLAS_E2E_DIRECTOR_EMAIL=
ATLAS_E2E_DIRECTOR_PASSWORD=
ATLAS_E2E_MANAGER_EMAIL=
ATLAS_E2E_MANAGER_PASSWORD=
ATLAS_E2E_BROKER_EMAIL=
ATLAS_E2E_BROKER_PASSWORD=
```

Use quatro contas sintéticas, distintas, ativas e pertencentes à organização de
homologação.

Valide a preparação:

```bash
npm run test:e2e:ready
```

Depois execute:

```bash
npm run test:e2e
```

## Caminho B — aplicação local com banco de homologação

Além das contas E2E, preencha:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
ATLAS_CRON_SECRET=

ATLAS_BASE_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
ATLAS_E2E_BASE_URL=http://localhost:3000
ATLAS_ENV=development
ATLAS_DATABASE_ENVIRONMENT=development
ATLAS_ENVIRONMENT_ID=atlas-v30-local-homologation
ATLAS_HOSTING_PROVIDER=local
```

A `service role`, o acesso Postgres e o segredo de cron são exclusivos do
servidor/local seguro. Nunca devem usar prefixo `NEXT_PUBLIC_`.

Valide:

```bash
npm run test:e2e:ready
npm run preflight:production
```

## Ordem obrigatória do Supabase

Antes de qualquer publicação:

1. confirmar que o projeto selecionado é `atlas-v3-homologacao`;
2. criar backup;
3. restaurar o backup em ambiente isolado e registrar o tempo;
4. reconciliar as migrations aplicadas com os 126 arquivos locais;
5. aplicar somente migrations revisadas e pendentes;
6. confirmar `public.atlas_events`;
7. confirmar `20260723090000_explicit_data_api_grants.sql`;
8. recarregar o schema cache;
9. testar RLS com dois tenants sintéticos;
10. registrar evidência sanitizada, sem IDs de projeto, e obter aprovação humana.

As 126 migrations correspondem à base local consolidada: 124 arquivos
históricos e duas correções de segurança pendentes. Nenhuma delas deve ser
aplicada diretamente no projeto vivo antes do ensaio isolado.

Não aplicar migrations em lote apenas porque estão presentes no diretório.

## Bloqueios externos registrados em 23/07/2026

- o projeto Supabase de homologação está saudável, mas ainda sem organização,
  perfis e dados comerciais;
- o ledger remoto ainda não contém as duas migrations locais de segurança;
- não existe evidência preenchida de backup e restauração;
- a instalação local de PostgreSQL 17, Docker e Colima não foi autorizada pela
  plataforma porque o limite de uso da ferramenta foi atingido;
- o `npm audit` não conseguiu consultar o registry pela restrição de rede;
- o ambiente local ainda não contém as credenciais e contas E2E.

Esses itens não são falhas do código. Eles impedem afirmar que o produto está
100% pronto para operação real.

Há duas rotas seguras para o ensaio das migrations:

1. instalar PostgreSQL 17 e um runtime de contêiner quando a autorização voltar
   a estar disponível;
2. criar uma branch temporária do Supabase, ensaiar e removê-la logo após a
   validação. Na organização atual, essa branch custa **US$ 0,01344 por hora** e
   só pode ser criada após aprovação explícita desse custo.

## Integrações controladas

Depois de CRM, autenticação e RLS aprovados:

- IA: uma pergunta sem dado pessoal, medindo latência, custo e fallback;
- WhatsApp: número exclusivo de teste, consentimento e template aprovado;
- Meta Lead Ads: uma lead de teste;
- CAPI: um evento com `test_event_code` e `event_id` deduplicado;
- outbox: provar processamento, retry e ausência de falha silenciosa.

Uma variável preenchida não torna a integração operacional. O estado muda para
ativo somente com recibo real e revisão humana.

## Fechamento

Quando as fases 27 e 28 estiverem verdes:

```bash
npm run release:prebuild-check
npm run package:hostinger
npm run package:hostinger:clean-build
```

Esse é o único momento autorizado para o build final e o novo ZIP. O pacote
anterior permanece rejeitado.
