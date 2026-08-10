# ATLAS V30 — roteiro canônico de homologação real

## Objetivo

Fechar as 30 fases com uma cadeia única e auditável:

`fonte → testes locais → Supabase isolado → jornadas E2E → build limpo → ZIP → Hostinger → decisão humana`.

Abrir uma página não é suficiente. A aprovação exige leitura, gravação,
persistência após recarga, RBAC, isolamento de tenant e ausência de erro técnico
visível.

## Regras invioláveis

- Node.js 24 no executor de QA e na Hostinger;
- DDL e migrations antes do código que depende delas;
- contas sintéticas e exclusivas de homologação;
- nenhum segredo no Git, no chat, nos relatórios ou no ZIP;
- nenhum cliente real usado como fixture;
- nenhuma ação externa sem aprovação humana explícita;
- um único `next build` local de validação, dentro do ensaio limpo da fase 29;
- produção só após parecer humano; falha implica correção ou rollback.

## 1. Instalação reproduzível

Na raiz deste projeto:

```bash
nvm use 24
npm ci
npm run prisma:generate
```

O executor E2E já está fixado no projeto em `@playwright/test` 1.61.1 e o
Chromium já foi instalado neste computador. Em uma instalação limpa, use:

```bash
npm ci
npx playwright install chromium
```

Se o executor já possuir um Chromium compatível, informe o caminho em
`ATLAS_E2E_CHROMIUM_PATH`. O navegador permanece fora do pacote da aplicação.

Valide sem executar o navegador:

```bash
npm run test:e2e:contract
npm run test:e2e:dependencies
```

## 2. Ambiente seguro

```bash
npm run prepare:test
```

Preencha `.env.local` somente no computador de homologação. Nunca cole valores
reais no chat, em documentação, no Git ou no ZIP.

Para testar a aplicação já publicada na Hostinger, configure:

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

Nesse modo remoto, o Playwright não precisa receber as chaves privadas do
Supabase. A aplicação publicada é responsável pela conexão do servidor.

Para executar a aplicação localmente, configure também:

```text
ATLAS_E2E_BASE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ATLAS_E2E_ADMIN_EMAIL=
ATLAS_E2E_ADMIN_PASSWORD=
ATLAS_E2E_DIRECTOR_EMAIL=
ATLAS_E2E_DIRECTOR_PASSWORD=
ATLAS_E2E_MANAGER_EMAIL=
ATLAS_E2E_MANAGER_PASSWORD=
ATLAS_E2E_BROKER_EMAIL=
ATLAS_E2E_BROKER_PASSWORD=
```

O ADMIN pode reutilizar `ATLAS_TEST_EMAIL` e `ATLAS_TEST_PASSWORD`. Diretor,
gerente e corretor devem ser contas distintas, ativas e vinculadas ao tenant de
homologação.

Execute:

```bash
npm run test:e2e:ready
```

## 3. Supabase: prova antes da aplicação

Siga `docs/POST_DEPLOY_CHECKLIST.md`.

Ordem obrigatória:

1. confirmar o projeto Supabase de homologação;
2. criar backup/snapshot;
3. provar restauração em ambiente isolado;
4. reconciliar o ledger de migrations;
5. aplicar migrations pendentes;
6. confirmar tabelas e colunas críticas;
7. executar a matriz RLS com dois tenants sintéticos;
8. gerar as evidências sanitizadas das fases 2–24;
9. obter aprovação humana da restauração e do tenant.

As 17.151 leads do V1 são origem histórica. Elas não devem ser copiadas para o
V30 sem importação supervisionada, deduplicação, consentimento, quarentena e
plano de reversão.

## 4. Regressão local sem build

```bash
npm run consolidation:30:local-gates
npm run consolidation:30:status
npm run typecheck:active
npm run lint
```

Critério:

- zero fase `blocked`;
- zero falha de código;
- fases de ambiente abertas apenas por evidência externa objetiva;
- relatório atualizado em `docs/ATLAS_V30_CONSOLIDATION_STATUS.md`.

## 5. Jornadas autenticadas

O Playwright inicia o servidor local quando a URL aponta para localhost:

```bash
npm run test:e2e
```

O teste comprova para ADMIN, diretor, gerente e corretor:

- login e contexto de organização;
- papel correto;
- Command Center;
- Leads;
- Pipeline/Kanban;
- Tarefas;
- Agenda;
- Clientes 360;
- Projetos;
- ausência de erro JavaScript e de mensagens técnicas na interface.

Evidências de falha ficam em `artifacts/e2e/`. Vídeo, trace e screenshot são
retidos somente quando uma jornada falha.

## 6. Roteiro supervisionado de escrita

Com dados sintéticos identificados por um prefixo único:

1. criar uma lead;
2. confirmar responsável único;
3. qualificar objetivo, prazo, pagamento, orçamento, região e tipologia;
4. recarregar a página e confirmar persistência;
5. mover a lead no Kanban;
6. criar próxima ação e tarefa;
7. abrir Agenda e Cliente 360;
8. associar projeto e material privado;
9. registrar proposta;
10. marcar ganho somente com aprovação humana;
11. comprovar que o corretor não enxerga a carteira de outro corretor;
12. remover ou arquivar a fixture conforme a política de homologação.

## 7. Integrações reais controladas

Registrar recibo sanitizado para cada teste:

- uma chamada de IA sem dado pessoal e com custo medido;
- um envio WhatsApp para número exclusivo de teste e template aprovado;
- uma lead Meta real de teste;
- um evento CAPI com `test_event_code`;
- `event_id` igual entre browser/CRM e servidor para deduplicação;
- leitura do retorno da Meta sem promover campanha ou orçamento;
- worker e dead-letter sem falha silenciosa.

Chave configurada não significa integração ativa. O status só fica verde depois
de resposta real, persistência do recibo e revisão humana.

## 8. Gate final e único build

Somente quando as fases 1–28 estiverem prontas:

```bash
npm run release:prebuild-check
npm run package:hostinger
npm run package:hostinger:clean-build
```

O último comando executa o único `next build` local de validação: extrai o ZIP em diretório
temporário, instala com `npm ci` e compila exatamente o conteúdo que será
publicado. Não execute `npm run build` separadamente.

Resultado obrigatório em `dist/hostinger/`:

- `atlas-v3-hostinger-homologation.zip`;
- `atlas-v3-hostinger-homologation.zip.sha256`;
- manifesto com fingerprint da fonte;
- inventário interno de hashes;
- zero `.env.local`, chave, planilha, PDF ou dado privado.

## 9. Hostinger

1. aplicar DDL aprovado antes de trocar o código;
2. validar o SHA-256 do ZIP;
3. publicar em ambiente de homologação;
4. executar `npm ci` e `npm run prisma:generate`;
5. executar `npm run build` no processo de implantação da Hostinger;
6. iniciar com `npm start` ou PM2;
7. executar worker e cron com o mesmo ambiente;
8. rodar smoke real, rotas autenticadas e Playwright contra a URL HTTPS;
9. repetir o roteiro supervisionado de escrita.

O build da Hostinger é a compilação obrigatória do ambiente de destino, a partir
do mesmo ZIP já validado. Ele não representa uma nova iteração de desenvolvimento
nem autoriza alterar o código depois do gate da fase 29.

## 10. Aceite ou rollback

O parecer final precisa registrar:

- versão/fingerprint e SHA-256;
- projeto Supabase e ambiente Hostinger;
- quatro papéis aprovados;
- jornadas de leitura e escrita;
- RLS entre tenants;
- latência e erros;
- IA, WhatsApp, Meta Lead Ads e CAPI;
- backup, tempo de restauração e rollback;
- pendências e risco residual;
- decisão `GO`, `NO-GO` ou `GO COM RESTRIÇÕES`.

Sem esse parecer, o ZIP permanece candidato de homologação e não deve ser
promovido para produção.
