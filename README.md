# ATLAS ONE

Plataforma de inteligência comercial para o mercado imobiliário. O ATLAS reúne CRM, leads, pipeline, agenda, projetos, campanhas, automações e copilotos de IA em uma operação orientada a conversão.

## Ambiente oficial

- Aplicação: Next.js 16 em servidor Node.js.
- Hospedagem: Hostinger.
- Runtime: Node.js 24 recomendado; mínimo suportado pelo projeto: Node.js 22.
- Dados, autenticação e arquivos privados: Supabase.
- Processo web: `npm start` ou `pm2 start ecosystem.config.cjs`.
- Segredos: somente no painel seguro da Hostinger ou no ambiente autorizado. Nunca entram no ZIP.

## Preparação local

```bash
nvm use
npm ci
npm run prisma:generate
npm run doctor
```

O desenvolvimento local usa:

```bash
npm run dev
```

## Validação e publicação

O programa de consolidação oficial está em
[`docs/ATLAS_V30_CONSOLIDATION_30_PHASES.md`](docs/ATLAS_V30_CONSOLIDATION_30_PHASES.md).
Ele concentra os gates de código, Supabase, CRM, IA, Meta/CAPI, WhatsApp,
segurança e homologação.

Regras de release:

1. migrations aprovadas e ensaiadas antes do código que depende delas;
2. nenhum dado real ou segredo dentro do pacote;
3. um único build completo no gate final;
4. ZIP gerado somente após a regressão aprovada;
5. teste real na Hostinger antes de promover para produção.

O roteiro de implantação está em
[`docs/HOSTINGER_DEPLOYMENT.md`](docs/HOSTINGER_DEPLOYMENT.md) e a ordem pós-deploy em
[`docs/POST_DEPLOY_CHECKLIST.md`](docs/POST_DEPLOY_CHECKLIST.md).

## Comandos essenciais

```bash
npm run consolidation:30:check
npm run release:prebuild-check
npm run build
npm run package:hostinger
```

Os três últimos comandos pertencem ao fechamento do ciclo. Não gere um novo ZIP
para cada correção intermediária.
