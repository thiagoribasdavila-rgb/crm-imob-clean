# Promoção de domínio — app.atlasaios.com.br (homologação no domínio real)

## Objetivo e princípio

Subir o Atlas v3 em **https://app.atlasaios.com.br** para testar no domínio real **sem perder o aprendizado** já acumulado na URL provisória.

> **Regra de ouro:** este movimento **reutiliza o mesmo projeto Supabase e o mesmo ambiente** de homologação. Não se cria banco novo, não se roda seed, não se apaga nada. Leads, memória comercial e calibração da IA vivem no Supabase — mantendo o mesmo projeto, tudo é preservado.
>
> Continua valendo `ATLAS_ENV=homologation`. A cutover limpa para **produção** (apex `atlasaios.com.br` + `ATLAS_ENV=production` + **outro** projeto Supabase, conforme `HOSTINGER_DEPLOYMENT.md`) é uma etapa **posterior**, feita só quando o piloto validar — e ela sim começa com banco novo.

Hosting: **Hostinger Node.js Web App** (domínio e SSL pelo painel; sem nginx/certbot manual).

---

## 1. DNS

No painel de DNS do domínio `atlasaios.com.br`, crie o subdomínio apontando para a app da Hostinger:

- Registro **A** `app` → IP do servidor da Node.js Web App, **ou**
- Registro **CNAME** `app` → host da app fornecido pela Hostinger (use o que o painel indicar ao anexar o domínio).

Propagação: aguarde resolver antes de emitir o SSL. Verifique: `dig +short app.atlasaios.com.br`.

## 2. Anexar domínio + SSL (painel Hostinger)

1. Abra a Node.js Web App do Atlas → **Domains** → adicione `app.atlasaios.com.br`.
2. Ative **SSL (Let's Encrypt)** para o subdomínio pelo painel e aguarde o certificado ficar *Active*.
3. Force HTTPS (o app já envia HSTS; o redirect de HTTP→HTTPS deve ficar ligado no painel).

## 3. Variáveis de ambiente (painel → Environment)

Altere **apenas** as URLs. **Não** mexa em Supabase, chaves de IA, `ATLAS_ENV`, `ATLAS_ENVIRONMENT_ID` nem `ATLAS_DEFAULT_ORGANIZATION_ID` — manter tudo preserva o ambiente e o aprendizado.

```diff
- ATLAS_BASE_URL=https://<url-provisoria>
- NEXT_PUBLIC_APP_URL=https://<url-provisoria>
+ ATLAS_BASE_URL=https://app.atlasaios.com.br
+ NEXT_PUBLIC_APP_URL=https://app.atlasaios.com.br

# inalterados (preservam o aprendizado):
# ATLAS_ENV=homologation
# ATLAS_DATABASE_ENVIRONMENT=homologation
# ATLAS_ENVIRONMENT_ID=atlas-v3-hostinger-homolog
# NEXT_PUBLIC_SUPABASE_URL / *_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / DATABASE_URL  → os mesmos
```

Se `GOOGLE_CALENDAR_REDIRECT_URI` / `MICROSOFT_CALENDAR_REDIRECT_URI` estiverem definidos, atualize-os para o novo host (ver seção 5).

## 4. Supabase Auth (mesmo projeto)

No projeto Supabase de homologação → **Authentication → URL Configuration**:

- **Site URL:** `https://app.atlasaios.com.br`
- **Redirect URLs:** adicione `https://app.atlasaios.com.br/auth/callback` (mantenha a URL provisória enquanto testa a virada; remova depois).
- O template de recuperação de senha deve usar `{{ .RedirectTo }}` (já orientado no deployment doc).

Isso garante que magic links, convites e recuperação de senha apontem para o domínio novo — sem migrar usuários.

## 5. Callbacks externos (consoles dos provedores)

Estas URLs vivem nos consoles externos — atualize/**adicione** o novo host (mantendo o antigo até a virada estar validada):

| Provedor | Onde | Novo valor |
|---|---|---|
| Meta (Lead Ads) | App → Webhooks | `https://app.atlasaios.com.br/api/webhooks/meta` (verify token inalterado) |
| WhatsApp Cloud | App → Configuration → Webhook | `https://app.atlasaios.com.br/api/webhooks/whatsapp` |
| Google Calendar OAuth | Google Cloud Console → Credentials → Redirect URIs | `https://app.atlasaios.com.br/...` (igual ao valor de `GOOGLE_CALENDAR_REDIRECT_URI`) |
| Microsoft Calendar OAuth | Entra ID → App → Redirect URIs | `https://app.atlasaios.com.br/...` |
| **Portais** (novo) | Portal / encaminhador de e-mail | `https://app.atlasaios.com.br/api/webhooks/portals/<provider>` com headers `x-atlas-portal-account` + `x-atlas-signature-256` |

## 6. Deploy do build

Use o pacote enxuto verificado — **não** compacte a pasta de dev manualmente:

```bash
npm run package:hostinger        # gera ZIP + SHA-256 em dist/hostinger
```

No servidor / painel: subir o ZIP, então `npm ci` → `npm run prisma:generate` → `npm run validate` → `npm start` (ou reiniciar a Web App pelo painel). Cron do worker inalterado (mesmo `ATLAS_CRON_SECRET`):

```text
* * * * * cd /caminho/atlas-v3 && /caminho/node scripts/run-workers.mjs
```

## 7. Smoke pós-virada (no domínio novo)

Confirme, em `https://app.atlasaios.com.br`:

- [ ] HTTPS válido (cadeado, sem misto).
- [ ] Login e **recuperação de senha** (link chega apontando para o domínio novo).
- [ ] Leitura de leads e pipeline (dados de homologação **presentes** = aprendizado preservado).
- [ ] `GET /integrations/hostinger` — ensaio de restart (Fase 18).
- [ ] Webhook Meta/WhatsApp recebendo (ping de teste).
- [ ] **Portais:** `POST /api/v1/integrations/portals/webhook-test` com `{ provider, externalAccountId }` (sessão de diretoria) retornando `status: "passed"`.

## 8. Rollback

Como é troca de domínio sobre o mesmo banco, o rollback é reverter `ATLAS_BASE_URL`/`NEXT_PUBLIC_APP_URL` e o Site URL do Supabase para a URL provisória — **sem tocar em dados**. Mantenha o ZIP da última release aprovada para rollback de código.

## 9. Depois (cutover de produção — etapa futura, não agora)

Quando o piloto validar em `app.atlasaios.com.br`: promover o **apex** `atlasaios.com.br` com `ATLAS_ENV=production`, `ATLAS_DATABASE_ENVIRONMENT=production`, **novo** projeto Supabase e novo `ATLAS_ENVIRONMENT_ID`; remover `ATLAS_BOOTSTRAP_SECRET`, `ATLAS_TEST_EMAIL`, `ATLAS_TEST_PASSWORD`; snapshot/backup antes. Decidir então o que do aprendizado de homologação deve ser migrado para o banco de produção.
