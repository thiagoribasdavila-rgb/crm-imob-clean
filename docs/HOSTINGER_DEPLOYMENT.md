# Atlas One na Hostinger

## Arquitetura

- Next.js/Node.js executado pela Hostinger.
- Supabase como banco, autenticação e storage externos.
- OpenAI e Perplexity acessados diretamente pelo servidor.
- Worker de outbox acionado por cron da Hostinger.
- O Atlas One é uma implantação limpa. Pacotes históricos são somente referência documental e não participam da execução.

## Aplicação

Use Node.js 22 ou superior (Node 24 recomendado), execute `npm ci`, `npm run prisma:generate` e inicie com `npm start` depois que o pacote tiver passado pelo build limpo da fase 29. Em VPS, `pm2 start ecosystem.config.cjs` mantém o processo ativo. Em Node.js Web Apps, configure o comando de inicialização como `npm start`.

No painel Node.js Web Apps, mantenha o diretório raiz na pasta que contém `package.json`, use `npm run build` como comando de build e `.next` como diretório de saída. Não defina `ATLAS_NEXT_BUNDLER=webpack`: o build homologado usa Turbopack para reduzir o pico de memória e conserva Webpack somente como fallback diagnóstico explícito.

O pacote enxuto é preparado com `npm run package:hostinger` e recebe seu único build completo no ensaio limpo `npm run package:hostinger:clean-build`. Use o ZIP e o SHA-256 criados em `dist/hostinger`; não compacte manualmente a pasta de desenvolvimento.

## Worker

Configure um cron por minuto com o mesmo ambiente da aplicação:

O mesmo worker verifica a jornada comercial noturna. Configure `WHATSAPP_NIGHTLY_APPROACH_TEMPLATE` com o nome técnico de um template aprovado; novas abordagens só são preparadas após 22h, com consentimento e aprovação humana.

```text
* * * * * cd /caminho/atlas-v3 && /caminho/node scripts/run-workers.mjs
```

Teste manualmente com `npm run worker:run`. Mantenha a saída durante a homologação para comprovar execução e falhas.

Os logs do PM2 são separados em `logs/atlas-v3-out.log` e `logs/atlas-v3-error.log`, com data e fuso. Crie o diretório `logs` no primeiro provisionamento e configure rotação no painel da Hostinger para evitar crescimento ilimitado.

Para o ensaio da Fase 18, abra `/integrations/hostinger`, inicie o teste, execute `pm2 restart atlas-v3-homolog` e volte à tela. A aplicação compara a identificação do processo anterior com a nova, confirma o banco e registra o tempo de recuperação.

Configure também o relatório diário da diretoria às 08:00 no horário do servidor:

```text
0 8 * * * cd /caminho/atlas-v3 && /caminho/node scripts/run-daily-meta-report.mjs
```

Teste com `npm run reports:meta-daily`. O processo é idempotente: gera um relatório por organização e dia.

## Variáveis mínimas

- `ATLAS_HOSTING_PROVIDER=hostinger`
- `ATLAS_ENV=homologation`
- `ATLAS_DEFAULT_ORGANIZATION_ID=<organization-id-da-homologacao>` (use o identificador da organização atual; nunca reutilize um tenant legado)
- `ATLAS_ENVIRONMENT_ID=atlas-v3-hostinger-homolog` (use outro identificador exclusivo em produção)
- `ATLAS_DATABASE_ENVIRONMENT=homologation` (deve coincidir com `ATLAS_ENV`)
- `ATLAS_BASE_URL=https://homolog.seu-dominio.com.br`
- No Supabase Auth, configure `Site URL` com esse mesmo domínio e adicione `https://homolog.seu-dominio.com.br/auth/callback` às Redirect URLs. O template de recuperação deve usar `{{ .RedirectTo }}`.
- Supabase público e service role somente no servidor.
- `ATLAS_CRON_SECRET`
- `OPENAI_API_KEY`
- `PERPLEXITY_API_KEY` quando a pesquisa externa estiver habilitada.
- `DEEPSEEK_API_KEY` + `ATLAS_DEEPSEEK_MODEL`, `QWEN_API_KEY` + `ATLAS_QWEN_MODEL`, `KIMI_API_KEY` + `ATLAS_KIMI_MODEL` e `GLM_API_KEY` + `ATLAS_GLM_MODEL` são rotas econômicas opcionais. Homologue uma por vez; não copie credenciais de planos gratuitos de aplicativos.
- `ATLAS_AI_FAST_PROVIDER_ORDER`, `ATLAS_AI_COMMERCIAL_PROVIDER_ORDER` e `ATLAS_AI_REASONING_PROVIDER_ORDER` controlam a ordem de fallback. Requisições com dados pessoais ignoram essas rotas e permanecem na OpenAI.
- Credenciais Meta quando Lead Ads estiver em teste.

Produção deve usar `ATLAS_ENV=production`, `ATLAS_DATABASE_ENVIRONMENT=production`, outro projeto Supabase e outro `ATLAS_ENVIRONMENT_ID`. Remova `ATLAS_BOOTSTRAP_SECRET`, `ATLAS_TEST_EMAIL` e `ATLAS_TEST_PASSWORD` antes da promoção.

## Publicação segura

1. Criar a aplicação V3 no domínio ou subdomínio escolhido, sem reutilizar arquivos da instalação removida do V2.
2. Aplicar migrações somente no projeto Supabase de homologação. Siga `docs/POST_DEPLOY_CHECKLIST.md`: DDL antes do código. Isso garante tabelas como `public.atlas_events` antes de rotas como `/api/v3/events/ingest` entrarem em uso.
3. Executar preflight, rotas reais e roteiro por perfil.
4. Criar snapshot/backup antes de qualquer promoção.
5. Manter o ZIP e o commit da última versão V3 aprovada para rollback.

## Ensaio de rollback entre releases do V3

Como o V2 foi removido, o rollback restaura a última release V3 aprovada. Não apague banco, storage, backups ou variáveis durante o ensaio.

1. Confirme no Command Center que há um backup com restauração aprovada.
2. Pause temporariamente entradas no V3 e anote o horário inicial.
3. Restaure o ZIP da última release V3 aprovada e reinstale as dependências com `npm ci`.
4. Valide no V3 restaurado: HTTPS, login, recuperação de senha, leitura de leads, pipeline e integrações essenciais.
5. Registre o código HTTP, o horário final e a referência da evidência em `/atlas-v3/audit`.
6. Se o ensaio falhar, restaure a release atual e registre a falha; não tente corrigir durante a janela.
# Armazenamento privado dos materiais

O Atlas pode manter os materiais no Supabase Storage ou usar qualquer serviço compatível com S3 (incluindo Cloudflare R2). A aplicação continua na Hostinger; somente os arquivos pesados saem do processo web.

1. Crie um bucket privado, sem acesso público e com versionamento/retenção conforme a política da empresa.
2. Configure as variáveis `ATLAS_OBJECT_STORAGE_*` descritas em `.env.example`.
3. Mantenha `ATLAS_MATERIAL_STORAGE_PROVIDER=supabase` durante o ensaio.
4. Consulte `GET /api/v1/governance/material-storage-migration` com uma sessão de diretor.
5. Migre lotes pequenos com `POST` e `{ "confirm": true, "batchSize": 3 }`.
6. Abra os links temporários e confira os documentos. A origem Supabase é preservada para reversão.
7. Depois da homologação, use `ATLAS_MATERIAL_STORAGE_PROVIDER=s3` para direcionar novos uploads à nuvem.

Nunca exponha chaves S3 como `NEXT_PUBLIC_*`. Os arquivos permanecem privados e são entregues por links assinados de 15 minutos.
