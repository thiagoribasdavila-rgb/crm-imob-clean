# Atlas V3 na Hostinger

## Arquitetura

- Next.js/Node.js executado pela Hostinger.
- Supabase como banco, autenticação e storage externos.
- OpenAI e Perplexity acessados diretamente pelo servidor.
- Worker de outbox acionado por cron da Hostinger.
- V2 permanece isolado até o aceite operacional do V3.

## Aplicação

Use Node.js 24, execute `npm ci`, `npm run prisma:generate`, `npm run validate` e inicie com `npm start`. Em VPS, `pm2 start ecosystem.config.cjs` mantém o processo ativo. Em Node.js Web Apps, configure o comando de inicialização como `npm start`.

## Worker

Configure um cron por minuto com o mesmo ambiente da aplicação:

O mesmo worker verifica a jornada comercial noturna. Configure `WHATSAPP_NIGHTLY_APPROACH_TEMPLATE` com o nome técnico de um template aprovado; novas abordagens só são preparadas após 20h, com consentimento e aprovação humana.

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
- `ATLAS_BASE_URL=https://homolog.seu-dominio.com.br`
- No Supabase Auth, configure `Site URL` com esse mesmo domínio e adicione `https://homolog.seu-dominio.com.br/auth/callback` às Redirect URLs. O template de recuperação deve usar `{{ .RedirectTo }}`.
- Supabase público e service role somente no servidor.
- `ATLAS_CRON_SECRET`
- `OPENAI_API_KEY`
- `PERPLEXITY_API_KEY` quando a pesquisa externa estiver habilitada.
- Credenciais Meta quando Lead Ads estiver em teste.

## Publicação segura

1. Criar subdomínio e aplicação separados do V2.
2. Aplicar migrações somente no projeto Supabase de homologação.
3. Executar preflight, rotas reais e roteiro por perfil.
4. Criar snapshot/backup antes de qualquer promoção.
5. Manter rollback para o V2 até o piloto ser aprovado.

## Ensaio de rollback V3 → V2

O rollback troca somente o destino do tráfego. Não apague a aplicação, banco, storage ou variáveis do V3 durante o ensaio.

1. Confirme no Command Center que há um backup com restauração aprovada.
2. Pause temporariamente entradas no V3 e anote o horário inicial.
3. Na Hostinger, altere o domínio público para a aplicação V2 preservada; mantenha o V3 no subdomínio interno de homologação.
4. Valide no V2: HTTPS, login, leitura de leads, pipeline e integrações essenciais.
5. Registre o código HTTP, o horário final e a referência da evidência em `/atlas-v3/audit`.
6. Se o ensaio falhar, reverta o apontamento ao V3 e registre a falha; não tente corrigir durante a janela.
