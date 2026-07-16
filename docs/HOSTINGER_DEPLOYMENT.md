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

```text
* * * * * cd /caminho/atlas-v3 && /caminho/node scripts/run-workers.mjs
```

Teste manualmente com `npm run worker:run`. Mantenha a saída durante a homologação para comprovar execução e falhas.

## Variáveis mínimas

- `ATLAS_HOSTING_PROVIDER=hostinger`
- `ATLAS_ENV=homologation`
- `ATLAS_BASE_URL=https://homolog.seu-dominio.com.br`
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
