# Atlas One V1000 — instalação de homologação

Esta entrega instala o Atlas One sobre o projeto Supabase gratuito já existente. Ela não cria branch paga, não recria o banco e não inclui dados, usuários, senhas ou chaves no ZIP.

## 1. Requisitos

- Hostinger com aplicação Node.js;
- Node.js 24;
- projeto Supabase atual;
- acesso às variáveis do projeto Supabase;
- domínio de homologação com HTTPS.

## 2. Enviar e instalar

1. Envie o ZIP auditado mais recente informado no relatório de entrega para uma pasta vazia.
2. Extraia o conteúdo.
3. Configure a versão Node.js 24.
4. Execute `npm ci --omit=dev=false`.
5. Copie `.env.homologation.example` para `.env.local`.
6. Substitua todos os valores `replace-with-*`.
7. Execute `npm run prisma:generate`.
8. Execute `npm run build`.
9. Inicie com `npm start` ou `pm2 start ecosystem.config.cjs`.

Na aplicação Node.js da Hostinger, use exatamente:

- versão Node.js: `24`;
- diretório raiz: a raiz extraída do ZIP, onde está o `package.json`;
- comando de build: `npm run build`;
- diretório de saída: `.next`;
- comando de inicialização: `npm start`.

Não configure `ATLAS_NEXT_BUNDLER=webpack`. O pacote usa Turbopack por padrão para permanecer dentro do limite de memória do construtor da Hostinger. A validação TypeScript completa já é executada antes da criação do ZIP auditado.

O ZIP contém uma aplicação Next.js única. As responsabilidades estão separadas assim:

- frontend: `app/`, `components/`, `styles/` e `public/`;
- backend: `app/api/`, `lib/`, `proxy.ts` e workers em `scripts/`;
- banco: `supabase/`, `prisma/` e `supabase/migrations/`.

## 3. Variáveis mínimas

Preencha:

- `ATLAS_ENV=homologation`
- `ATLAS_HOSTING_PROVIDER=hostinger`
- `ATLAS_BASE_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `ATLAS_CRON_SECRET`
- `ATLAS_BOOTSTRAP_SECRET` somente em instalação nova, antes da criação do primeiro administrador

Em uma instalação nova, gere `ATLAS_BOOTSTRAP_SECRET` com pelo menos 32 caracteres aleatórios. Ele é temporário e nunca deve ser enviado ao GitHub, ZIP ou chat. Se o administrador e a organização já existem, não configure o segredo e não execute o bootstrap novamente.

## 4. Primeiro acesso

Se a instalação ainda não possui administrador:

1. Abra `https://seu-dominio/setup`.
2. Informe organização, administrador, e-mail, senha forte e o segredo temporário.
3. Copie o `Organization ID` exibido.
4. Defina `ATLAS_DEFAULT_ORGANIZATION_ID` com esse ID.
5. Entre em `/login` e valide o painel.
6. Remova `ATLAS_BOOTSTRAP_SECRET` da Hostinger.
7. Reinicie a aplicação.

Se o administrador já existe, pule todo o bootstrap, mantenha `ATLAS_BOOTSTRAP_SECRET` removido e valide diretamente `/login`, `/dashboard`, `/api/health` e `/api/ready`.

A ativação é permitida apenas em `development` ou `homologation`, exige segredo de uso temporário e fica bloqueada assim que existe o primeiro perfil.

Alternativa por terminal:

```bash
npm run bootstrap:admin -- \
  --email=admin@suaempresa.com \
  --password='SENHA_FORTE_AQUI' \
  --name='Administrador' \
  --organization='Sua Empresa' \
  --confirm=CREATE_FIRST_ADMIN
```

## 5. Usuários e perfis

Depois do primeiro acesso, cadastre usuários reais pelo módulo administrativo:

- Diretor: acesso total à operação;
- Gerente: equipe e carteiras abaixo de sua gestão;
- Corretor: somente sua carteira e suas ações.

Não use o script legado de reset de contas oficiais para uma instalação limpa.

## 6. Recuperação de senha

No Supabase Auth, configure a URL do site e adicione:

```text
https://seu-dominio/auth/callback
https://seu-dominio/reset-password
```

Teste em `/forgot-password`. Para e-mail corporativo com identidade própria, configure SMTP no Supabase quando a operação real começar.

## 7. Integrações

Meta, WhatsApp, IA, e-mail e calendários permanecem desligados até receberem credenciais reais e um teste supervisionado. A ausência dessas chaves não pode interromper CRM, login, pipeline ou agenda.

## 8. Banco e migrações

O ambiente gratuito atual é a fonte oficial desta homologação. As migrations do ZIP preservam a evolução versionada, RLS e contratos existentes. Antes de migrar futuramente para outro projeto Supabase, gere uma exportação lógica completa do schema do ambiente atual; não presuma que um projeto novo possa ser reconstruído somente a partir dos arquivos históricos locais.

Antes de qualquer alteração remota:

1. exporte o schema e os dados;
2. confira `docs/POST_DEPLOY_CHECKLIST.md`;
3. aplique apenas migrations pendentes;
4. valide RLS e o tenant;
5. mantenha um plano de retorno.

## 9. Validação

Execute:

```bash
npm run clean:install:check
npm test
npm run typecheck
npm run lint
npm run test:e2e:contract
npm run test:e2e:dependencies
```

Os testes autenticados de navegador dependem das contas reais criadas após a instalação.
