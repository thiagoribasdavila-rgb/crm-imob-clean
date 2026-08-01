# Lançamento na URL oficial — atlasaios.com.br

## Princípio (preservar o aprendizado)

Subir o Atlas v3 no domínio definitivo **https://atlasaios.com.br** reutilizando o **mesmo projeto Supabase** de homologação — leads, memória comercial e calibração da IA são preservados. Mantém-se `ATLAS_ENV=homologation` nesta primeira operação real; a **cutover para produção limpa** (Supabase novo, `ATLAS_ENV=production`) fica documentada como etapa posterior, quando o piloto validar.

Hosting: **Hostinger Node.js Web App** (domínio + SSL pelo painel; sem nginx/certbot manual).

## Auditoria de código (feita)

O projeto é **100% dirigido por variável de ambiente** para URLs — **não há URL de app hardcoded** no frontend, backend, APIs, callbacks ou webhooks. Confirmado por varredura: as únicas URLs no código são docs do Prisma, links `wa.me`, citações da base de conhecimento e o fallback `http://localhost:3000` de `ATLAS_BASE_URL` (só local). CORS não fixa origem (same-origin, correto para CRM de domínio único). `next.config.ts` não tem redirects/domains. **Portanto, migrar de domínio é configuração, não mudança de código.**

Validação do estado atual (commit `4ccd31bd`): **typecheck 0 erros · ESLint limpo · `next build` completo**.

## 1. DNS + domínio + SSL (painel Hostinger)

1. DNS de `atlasaios.com.br`: registro **A/CNAME** do apex apontando para a Node.js Web App (o painel indica o alvo ao anexar).
2. Anexar **`atlasaios.com.br`** e **`www.atlasaios.com.br`** à app; ativar **SSL (Let's Encrypt)** para ambos.
3. **Redirect `www` → apex** e **HTTP → HTTPS** (o app já envia HSTS).

## 2. Variáveis de ambiente (painel → Environment)

Trocar **apenas** as URLs. Manter Supabase, chaves de IA, `ATLAS_ENV`, `ATLAS_ENVIRONMENT_ID` inalterados (preserva o ambiente e o aprendizado).

```diff
- ATLAS_BASE_URL=https://<url-provisoria>
- NEXT_PUBLIC_APP_URL=https://<url-provisoria>
+ ATLAS_BASE_URL=https://atlasaios.com.br
+ NEXT_PUBLIC_APP_URL=https://atlasaios.com.br
```

Se `GOOGLE_CALENDAR_REDIRECT_URI` / `MICROSOFT_CALENDAR_REDIRECT_URI` estiverem definidos, apontar para `https://atlasaios.com.br/...` (e atualizar nos consoles — seção 4).

## 3. Supabase Auth (mesmo projeto)

Authentication → URL Configuration:
- **Site URL:** `https://atlasaios.com.br`
- **Redirect URLs:** `https://atlasaios.com.br/auth/callback` (manter a provisória enquanto valida a virada).
- Configurar **SMTP** (Auth → SMTP) — **destrava a recuperação de senha e os convites de equipe** (hoje é o gargalo da Fase 1). Template com `{{ .RedirectTo }}`.

## 4. Callbacks externos (consoles) — só quando ligar cada integração

| Provedor | Novo valor |
|---|---|
| Meta (Lead Ads) | `https://atlasaios.com.br/api/webhooks/meta` |
| WhatsApp Cloud | `https://atlasaios.com.br/api/webhooks/whatsapp` |
| Google/Microsoft Calendar OAuth | `https://atlasaios.com.br/...` |
| Portais (novo) | `https://atlasaios.com.br/api/webhooks/portals/<provider>` |

## 5. Deploy do pacote

Usar o ZIP verificado (não compactar a pasta manualmente):
```bash
npm run package:hostinger   # dist/hostinger/atlas-v3-hostinger-homologation.zip + SHA-256
```
No servidor/painel: subir o ZIP → `npm ci` → `npm run prisma:generate` → `npm run validate` → `npm start` (ou reiniciar a Web App). Cron do worker inalterado (`ATLAS_CRON_SECRET`).

## 6. Checklist de go-live

| Item | Estado | Responsável |
|---|---|---|
| ✅ Código pronto (tsc/lint/build verdes, ZIP verificado) | **Feito** | — |
| ⬜ Domínio `atlasaios.com.br` conectado + SSL | Pendente | você (painel) |
| ⬜ Aplicação publicada (ZIP + `npm start`) | Pendente | você |
| ⬜ Banco conectado (mesmo Supabase; env inalterado) | Pendente | você (env) |
| ⬜ Migrations aplicadas (portais, RBAC, WhatsApp) | Pendente | você (Supabase) |
| ⬜ APIs funcionando (smoke pós-deploy) | Pendente | após deploy |
| ⬜ Login + recuperação de senha (depende do SMTP) | Pendente | você (SMTP Supabase) |
| 🟡 RBAC funcionando | Código pronto; migration a aplicar | você |
| ✅ CRM operacional | **Pronto** (código) | — |
| ✅ IA preparada para conexão | **Pronto** (provider-router, Claude gated) | — |

## 7. Primeira operação real (seed do ambiente inicial)

Fazer **na aplicação**, sob governança (não por SQL bruto), respeitando a hierarquia:

1. **Administrador Master** — primeiro acesso via `ATLAS_BOOTSTRAP_SECRET` (remover a variável após criar o admin, conforme `.env.example`).
2. **Diretor(es)** — criados pelo admin.
3. **Gerentes** — criados pelo diretor (rota `/settings/team` → `POST /api/v1/team`, respeitando `allowedNewRoles`).
4. **Corretores** — criados pelos gerentes.
5. **Empreendimentos** — cadastrar em `/developments` (Launch OS) com book/tabela/estoque reais.
6. **Primeiros leads** — entram por: importação supervisionada (`ATLAS_IMPORT_*`), site/webhook, ou os conectores de portal/Meta quando ligados.

Cada convite depende do **SMTP do Supabase** estar configurado (item 3). Sem SMTP, o convite falha ("configuração SMTP").

## 8. Cutover de produção (etapa futura, não agora)

Quando o piloto validar em `atlasaios.com.br`: promover `ATLAS_ENV=production`, `ATLAS_DATABASE_ENVIRONMENT=production`, **novo** projeto Supabase e novo `ATLAS_ENVIRONMENT_ID`; remover `ATLAS_BOOTSTRAP_SECRET`, `ATLAS_TEST_EMAIL`, `ATLAS_TEST_PASSWORD`; snapshot/backup antes. Decidir então o que do aprendizado migra para o banco de produção.
