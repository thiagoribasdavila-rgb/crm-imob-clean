# RUNBOOK DE DEPLOY — Atlas v3 na Hostinger (v2 — pós-auditoria adversarial)

**Objetivo único desta operação:** fazer `https://atlasaios.com.br/privacy`, `/terms` e `/data-deletion` responderem **HTTP 200 anonimamente**, para destravar a publicação do app "ATLAS AI OS" na Meta.

**Artefato:** `dist/hostinger/atlas-v3-hostinger-homologation.zip`
**Commit:** `437d3b117063476e8eb1e998ac62a9581a8a5d1c`
**SHA-256 do ZIP:** `e1f58990ed94ec2351a05b3781c11caa0a935bc2b790bcc09217af2273366e1f`
**Tamanho:** 4.516.418 bytes · 1559 entradas · inventário `RELEASE_FILES.sha256` com 1558 linhas

---

## O que mudou nesta versão (e por quê)

A v1 deste runbook foi reprovada por quatro auditorias independentes. As quatro convergiram em três defeitos estruturais, todos corrigidos aqui por **mudança de arquitetura do deploy**, não por remendo:

| Defeito da v1 | Correção estrutural na v2 |
|---|---|
| O rollback "de 2 a 5 minutos" era impossível: o `tar` excluía `node_modules` e o diretório era movido, então o PM2 não subia sem um `npm ci` dependente da rede. | **Deploy blue/green por diretório.** A release nova é montada em `<APPDIR>.new-$TS`, com `node_modules` e `.next` próprios. O rollback é um `mv` de volta — sem rede, sem `npm ci`, segundos. |
| `npm ci` rodava dentro do diretório vivo, apagando o `node_modules` do processo que estava servindo, com `autorestart: true` e `max_memory_restart: 1G` no ecosystem — qualquer restart durante o build derrubava produção de forma dura. | O diretório vivo **não é tocado** até a troca atômica (Fase 6). O build inteiro acontece ao lado. Janela de indisponibilidade cai de 10–30 min para segundos. |
| Nada provava que a máquina do SSH era a origem de `atlasaios.com.br`. Você podia buildar num servidor abandonado e culpar o CDN. | **Prova de origem por asset de BUILD_ID** (Passo 0.3), verificada no repo: o `matcher` do `proxy.ts` exclui `_next/static` **e** qualquer caminho com extensão de arquivo, então `/_next/static/<BUILD_ID>/_ssgManifest.js` responde anonimamente, sem redirect. É read-only, funciona **antes** do deploy e resolve o risco R9. |

Efeitos colaterais positivos da arquitetura blue/green, que dispensam mitigações inteiras da v1:

- **R3 (resíduo de release antiga) deixa de existir:** o diretório novo nasce só com os 1558 arquivos do ZIP.
- **Lock de quarentena preso no diretório vivo deixa de bloquear o build:** verificado em `scripts/route-quarantine.mjs:27` — o lock é `join(root, ".atlas-route-quarantine.lock")`, e `root = process.cwd()`. Build no diretório novo, lock no diretório novo.
- **`unzip -o` sobrescrevendo o `ecosystem.config.cjs` de produção deixa de acontecer:** o arquivo do pacote cai no diretório novo; o de produção fica intacto no diretório vivo até você decidir.
- **`unzip -o` sobrescrevendo o `.env` de produção deixa de ser possível:** o `.env` é copiado explicitamente e conferido por hash.

---

## Estado verificado (21/07/2026)

Tudo abaixo foi medido, não inferido.

| Verificação | Resultado |
|---|---|
| `curl https://atlasaios.com.br/privacy` | **307** → `/login?next=%2Fprivacy` |
| `curl https://atlasaios.com.br/terms` | **307** → `/login?next=%2Fterms` |
| `curl https://atlasaios.com.br/data-deletion` | **307** → `/login?next=%2Fdata-deletion` |
| `curl https://atlasaios.com.br/login` | **200** (sem `location`) |
| `curl https://atlasaios.com.br/dashboard` | **307** → `/login?next=%2Fdashboard` (correto, rota protegida) |
| Headers de origem | `server: hcdn`, `platform: hostinger`, `panel: hpanel`, `x-nextjs-cache: HIT` |
| DNS `atlasaios.com.br` | `89.116.213.88`, `77.37.42.227` (edge da Hostinger — **não é o IP do servidor de origem**) |
| DNS `app.atlasaios.com.br` | **não existe** |
| Git local | HEAD `437d3b11`, árvore versionada limpa (0 arquivos sujos) |
| ZIP local | checksum interno = externo = `e1f5899…66e1f`; única entrada de ambiente = `.env.example` |
| `proxy.ts:7-15` | `publicPages` **já contém** `/privacy`, `/terms`, `/data-deletion` |
| `proxy.ts:38` (matcher) | exclui `api/`, `_next/static`, `_next/image`, `favicon.ico`, `robots.txt`, `sitemap.xml` e **qualquer caminho com extensão** |
| `node scripts/check-legal-pages.mjs` | `47 passaram, 0 falharam`, exit 0 |
| Build local saudável | `.next/static` = **0** ocorrências do placeholder, **0** de `127.0.0.1:54321`, **1** arquivo com `supabase.co` |
| Build local saudável | `.next/server` = **3** ocorrências do placeholder (é o literal do código-fonte — **não** é defeito) |
| `.next/server/app/` | `privacy.html` (66 KB), `terms.html` (50 KB), `data-deletion.html` (33 KB) — os três existem |
| `.next/static/<BUILD_ID>/` | `_buildManifest.js`, `_ssgManifest.js`, `_clientMiddlewareManifest.js` |
| `next.config.ts` | **não** usa `output: "standalone"` → `next start` exige o diretório completo + `node_modules` |
| `package.json` | `engines.node = ">=20.9 <21"`; **não existe `.nvmrc`** no repo nem no ZIP |
| ZIP contém | `scripts/reset-official-auth-rbac.mjs` e `scripts/bootstrap-admin.mjs` (ver Passo 5.6) |
| ZIP **não** contém | diretório `logs/` (excluído no empacotador) → é preciso criá-lo |

**Conclusão:** existe um Next.js real servindo produção hoje, com um `proxy.ts` antigo. Isto é uma **ATUALIZAÇÃO de um serviço vivo**, jamais uma instalação nova.

---

## ⛔ Bloqueio zero — leia antes de qualquer coisa

**Não sabemos onde o processo de produção roda.** O domínio está atrás do CDN da Hostinger (`hcdn`), que esconde a origem. O repositório documenta **dois modelos mutuamente exclusivos**, ambos com documentação "viva":

- **(A) VPS Ubuntu** com Nginx + PM2 + certbot, app em `/var/www/atlas`, usuário `atlas` (`scripts/deploy-vps.sh`, `scripts/atlas-go-live.sh`, `docs/VPS_DEPLOY_ATLASAIOS.md`);
- **(B) Hostinger Node.js Web App** gerenciada pelo hPanel, sem Nginx/certbot manual (`docs/HOSTINGER_DEPLOYMENT.md`, `docs/DOMAIN_PROMOTION_APP_ATLASAIOS.md`).

O IP `85.209.93.32` que aparece hardcoded em `docs/GO_LIVE_SEQUENCE.md:34` e no cabeçalho do `atlas-go-live.sh` **não corresponde a nenhum IP que o DNS resolve hoje**.

Os headers medidos (`platform: hostinger`, `panel: hpanel`) são compatíveis com **os dois** modelos — a Hostinger serve VPS e hospedagem gerenciada atrás do mesmo edge. **Não dá para decidir daqui.** A Fase 0 decide, no servidor.

👉 **Se o modelo for B, o corpo principal deste runbook não se aplica — vá para o Anexo C.** A v1 mandava "parar" sem oferecer caminho; a v2 oferece o caminho B, com as incógnitas marcadas explicitamente.

---

## Convenções

Preencha por escrito, na Fase 0, **antes** de usar em qualquer comando:

| Símbolo | Significado | Como descobrir |
|---|---|---|
| `<SSH>` | comando de acesso, ex. `ssh usuario@host` | credencial do dono |
| `<APPDIR>` | diretório da aplicação (caminho absoluto) | Passo 0.2 (`pm2 describe` → `exec cwd`) |
| `<APPUSER>` | usuário dono do diretório e do processo | Passo 0.2 (`stat`, `ps -o user=`) |
| `<APPNAME>` | nome do processo PM2 hoje no ar | Passo 0.2 (`pm2 list`) |
| `<PORT>` | porta que o processo escuta | Passo 0.2 (`ss -lntp`) |

⚠️ **A v1 hardcodava `3000` e `atlas-v3-homolog` mesmo depois de admitir que ambos podiam ser outros.** Nesta versão, **nenhum** comando usa esses literais. Se você vir `3000` em algum lugar abaixo, é bug — substitua por `<PORT>`.

⚠️ **Sobre `set -e` em sessão interativa:** não cole `set -euo pipefail` no seu shell SSH — qualquer falha derruba a sessão no meio do deploy. Os blocos irreversíveis abaixo usam **encadeamento com `&&`**, que dá a mesma garantia sem esse efeito colateral. Onde o exit code de um pipe importa, o comando usa `PIPESTATUS` explicitamente.

⚠️ **Nunca escreva valor de segredo em nenhum comando deste runbook.** Todas as auditorias de `.env` abaixo imprimem apenas **nome da chave + rótulo**, nunca conteúdo.

---

## Antes de começar

### O que só o dono sabe (precisa estar em mãos, por escrito, antes do passo 1)

1. **Como se conecta ao servidor de origem**: usuário SSH + host/IP, ou credencial do hPanel. Se for SSH, confirmar se o usuário tem `sudo` (com ou sem senha).
2. **Confirmação de qual é o modelo, A ou B** — ou aceitação de que a Fase 0 vai descobrir.
3. **Se o `<APPDIR>/.env` do servidor já existe e está completo**, em especial `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (ou `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Sem elas **no momento do build**, o bundle sai quebrado e o login para de funcionar — e o build termina com sucesso, sem erro nenhum.
4. **Decisão sobre `ATLAS_ENV`** (Passo 0.7): o `ecosystem.config.cjs` do repo **força** `ATLAS_ENV=homologation` e `ATLAS_DATABASE_ENVIRONMENT=homologation`, sobrescrevendo o `.env`. Se este domínio é produção de verdade, isso ativa o fallback silencioso de organização (`lib/api/security.ts:291`) e mantém aberto o caminho de bootstrap de admin. **Decisão do dono, não do runbook.**
5. **Decisão sobre `ATLAS_BOOTSTRAP_SECRET`** (Passo 5.7): remover antes ou depois do restart. O padrão desta v2 é **antes**.
6. **Janela de manutenção e hora de corte absoluta** (Fase 3).
7. **Acesso ao hPanel** para eventual purge de cache do CDN.
8. **Se há backup/PITR válido do Supabase** — mesmo que este deploy não toque no banco (e ele não deve tocar), é higiene mínima.

### Ferramentas exigidas no servidor

`node` 20.x, `npm`, `unzip`, `sha256sum`, `tar`, `awk`, `curl`, `tmux` (ou `screen`), e saída de rede liberada para `registry.npmjs.org`. O ZIP é **source-only**: sem `node_modules`, sem `.next`. O build **obrigatoriamente** roda no servidor. **O Passo 0.1 verifica tudo isso antes de qualquer coisa.**

### O que este runbook NÃO faz — e você não deve fazer

| Não faça | Por quê |
|---|---|
| `supabase db push` | O banco vivo (`ietwopslgqxlenfyghqk`, ~17.151 leads reais) declara corte `20260716083708`; há **120** migrations posteriores no repo. Os docs prometem "4". `db push` aplicaria as 120. As 3 páginas legais **não precisam de nenhuma migration**. |
| `scripts/reset-official-auth-rbac.mjs` | Bane **todos** os `auth.users` por 100 anos e faz `UPDATE profiles SET active=false` na organização inteira. **O Passo 5.6 remove esse arquivo do servidor.** |
| `scripts/atlas-go-live.sh` | Bug conhecido: escreve vhost 443 sem `ssl_certificate`, o `nginx -t` falha, o `die` mata o script e os passos 9/10/11 (cron, pm2 startup, smoke) **nunca rodam** — mas o doc afirma que rodaram. Provisiona servidor do zero; aqui o servidor já existe. |
| `rm -f /etc/nginx/sites-enabled/default` | Ambos os scripts fazem isso sem backup. Se o VPS servir outro site, ele sai do ar em silêncio. |
| Copiar `.next` ou `node_modules` do Mac | `required-server-files.json` grava o caminho absoluto do Mac e os binários são `darwin-arm64`. Não funciona no Linux. |
| Transferir qualquer `.env` para o servidor | O ZIP é `git archive HEAD` e só contém `.env.example`. Mantenha assim. Falta de variável se corrige **editando no host**. |
| `git add -A` / `git commit` dentro do `<APPDIR>` | Com quarentena pendente, as rotas apareceriam como deletadas e o commit seria destrutivo. |

---

## Riscos conhecidos (com referência de passo **corrigida**)

A v1 apontava mitigações em "Passo 8.2" e "Passo 8.3" que **não existiam**. Corrigido.

| # | Risco | Severidade | Mitigação real, com passo que existe |
|---|---|---|---|
| R1 | Build sem `NEXT_PUBLIC_SUPABASE_*` no ambiente gera bundle com placeholder. Exit 0, login quebra para todos, definir a variável depois **não conserta** — exige rebuild. | **crítico** | Passo 5.4 (auditoria robusta do `.env`, com comprimento), Passo 5.5 (shell limpo de `NEXT_PUBLIC_*`), Passo 5.9 (checagem **positiva** no bundle), Passo 9.4 (login manual real). |
| R2 | Não sabemos onde a produção roda. Executar o procedimento errado derruba um serviço vivo, ou deploya num servidor que ninguém serve. | **crítico** | Passo 0.3 é **prova de origem por asset**, bloqueante. Anexo C cobre o modelo B. |
| R3 | `unzip -o` não remove arquivos de releases antigas — o deploy não seria clean install apesar de `HOSTINGER_PACKAGE.json` declarar `cleanInstall: true`. | alto | **Eliminado por construção:** blue/green monta diretório novo só com os 1558 arquivos do pacote. |
| R4 | `ecosystem.config.cjs` força `ATLAS_ENV=homologation` sobre o `.env`, ligando fallback de organização e mantendo o bootstrap de admin viável em domínio público. | **crítico** | Passo 0.7 (decisão do dono, por escrito), Passo 5.3 (qual ecosystem vai para o diretório novo), Passo 5.7 (remoção do bootstrap secret **antes** do restart), Passo 6.4 (verificação do ambiente efetivo). |
| R5 | Build interrompido deixa `.atlas-route-quarantine.lock` preso. | médio | **Reduzido por construção:** o lock nasce e morre no diretório novo. Passo 5.8 roda em `tmux`. Anexo A cobre recuperação, agora com guarda contra `cp -a /. .`. |
| R6 | `npm ci` com `NODE_ENV=production` exportado pula devDependencies — `typescript`, `tailwindcss`, `@tailwindcss/postcss` e o CLI `prisma` somem e o build quebra. | alto | Passo 5.5 imprime o `NODE_ENV` efetivo; Passo 5.8 usa `npm ci --include=dev`. |
| R7 | Precedência do `@next/env`: um `.env.local`/`.env.production` esquecido **vence** o `.env`, em silêncio. | médio | Passo 0.5 procura os arquivos; o diretório novo recebe **apenas** o `.env` (Passo 5.4). |
| R8 | O CDN (`hcdn`) pode continuar servindo o 307 cacheado depois do deploy. | médio | **Fase 7 mede na origem antes de olhar a borda** — o diagnóstico deixa de ser chute. Fase 10 purga só quando a origem já está correta. |
| R9 | "Não existe endpoint que revele versão/commit no ar." | — | **Risco eliminado: era falso.** O `BUILD_ID` está na URL dos assets e a rota é imune a `proxy.ts` e a reescrita de header. Passos 0.3 e 9.5. |
| R10 | Janela de indisponibilidade: PM2 fork, 1 instância. | médio → **baixo** | Blue/green: downtime = tempo de `mv` + boot do Next (segundos), não o build inteiro. |
| R11 | O deploy leva ~4 dias e 282 commits de mudanças, não só as 3 páginas. Inclui endurecimento de CSP. | alto | Passo 1.5 (`validate:deploy`) passa a ser **obrigatório**; Fase 9 inclui regressão completa; Anexo D documenta o plano B cirúrgico. |
| R12 | `.env.hostinger` local contém `ATLAS_TEST_EMAIL`, `ATLAS_TEST_PASSWORD`, `ATLAS_BOOTSTRAP_SECRET`; dois docs proíbem essas chaves no servidor, um terceiro manda copiar o arquivo inteiro. | alto | Este runbook **não transfere** `.env` nenhum. Passo 0.5 audita (só nomes). Passo 5.7 remove as três do `.env` do diretório novo. |
| R13 | `npm run package:hostinger:clean-build` tem o nome do ZIP hardcoded em `atlas-v3-hostinger-final.zip` (artefato de 18/jul, commit `8f863e4`). | alto | Passo 1.6: **não rodar**. O ensaio de build limpo desta release é o build da Fase 5. |
| R14 | Chaves vazias (WhatsApp, object storage, Perplexity, IA) falham só em runtime, em silêncio. | médio | Fora do escopo; registrado em "Depois do deploy". |
| **R15** | **O ZIP embarca `scripts/reset-official-auth-rbac.mjs` e `scripts/bootstrap-admin.mjs`** (confirmado por `unzip -Z1`), num host que carrega `SUPABASE_SERVICE_ROLE_KEY` do banco vivo. | alto | **Passo 5.6 remove os dois arquivos** antes do `npm ci`. |
| **R16** | **O backup da Fase 4 inclui o `.env` de produção** (ele está dentro do `<APPDIR>`), e `sudo mkdir -p` cria 755 / `tar` sai 644 → tarball com segredos legível por qualquer usuário local. | alto | Passo 4.0 usa `install -d -m 700`; Passo 4.2 faz `chmod 600` no tarball; a limpeza final expurga **as três** cópias de segredo. |
| **R17** | **Rodar `unzip`/`npm ci`/`build` como root** deixa `.next`, `node_modules` e `logs/` root-owned; o processo PM2 roda como `<APPUSER>` e falha ao escrever `.next/cache` e os logs — sem log claro, verde em todo smoke. | alto | Toda a Fase 5 roda via `sudo -u <APPUSER> -H bash -lc`; Passo 5.10 valida escrita antes da troca. |
| **R18** | **`npm ci` executa scripts de lifecycle de ~1000 pacotes.** Como root, num host com a service_role key do banco vivo, um pacote comprometido vira root imediato. | alto | Mesma mitigação de R17: nunca `sudo npm`. |
| **R19** | **O smoke (`smoke:hostinger`) aprova qualquer status 200–399** (`scripts/smoke-hostinger-release.mjs`: `passed = status >= 200 && status < 400 && !location.startsWith("http://")`). Um `/login` em 307 sai `passed: true`. Ele também exige base `^https://`, então só mede a borda. | alto | Fase 8 rebaixa o smoke a sinal informativo; o gate real é a Fase 7 (status **exatos** na origem). |
| **R20** | **`--update-env` injeta o ambiente do shell do operador** (`TS`, `NODE_OPTIONS`, proxies) no processo de produção, e o `pm2 save` seguinte persiste isso em `~/.pm2/dump.pm2`. A justificativa da v1 ("necessário para reler o `.env`") está errada: quem lê o `.env` é o `@next/env` a cada boot. | médio | Fase 6 reinicia **sem** `--update-env`, a partir de shell limpo; Passo 4.4 faz backup do `dump.pm2`; Passo 6.4 confere o ambiente efetivo. |

---

# FASE 0 — Reconhecimento (100% read-only) · **BLOQUEANTE**

**Nenhum comando desta fase altera o servidor.** Se você não conseguir completar a Fase 0, pare: o deploy não é seguro.

⚠️ **Correção da v1:** a v1 mandava ir ao Anexo A (que faz `rm -f` e `rm -rf` dentro do `<APPDIR>`) já no reconhecimento — ou seja, mutação destrutiva **antes de existir qualquer backup**. Nesta versão, o Passo 0.6 apenas **registra** o achado; a recuperação da quarentena só pode acontecer depois da Fase 4.

## 0.0 — Abrir o multiplexador AGORA

A v1 só mandava abrir `tmux` na fase de build, deixando o `tar` de backup (o passo mais longo e mais irreversível) rodando fora dele: SSH cai, `SIGHUP` mata o `tar`, e sobra um tarball **truncado** que passa em todos os critérios de sucesso da v1.

```bash
<SSH>
command -v tmux || command -v screen || echo "SEM MULTIPLEXADOR - BLOQUEIO"
tmux new -s atlas-deploy      # ou: screen -S atlas-deploy
```

Se cair o SSH: `tmux attach -t atlas-deploy` (ou `screen -r atlas-deploy`).
**Todo comando deste runbook, da Fase 0 ao Rollback, roda dentro dessa sessão.**

## 0.1 — Preflight de ferramentas e permissão

```bash
for c in node npm unzip tar sha256sum awk curl sed find; do
  command -v "$c" >/dev/null && echo "$c OK" || echo "$c AUSENTE - BLOQUEIO"
done
sudo -n true 2>/dev/null && echo "sudo sem senha OK" || echo "sudo PEDE SENHA ou indisponivel - confirme com o dono antes da Fase 4"
```

- **Sucesso:** tudo `OK`.
- **Falha:** qualquer `AUSENTE`. Descobrir isso agora, e não na Fase 5 com a janela já anunciada, é o ponto deste passo.
  - Sem `unzip` e sem poder instalar, a alternativa registrada é:
    `python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" /tmp/atlas-v3-hostinger-homologation.zip <DESTINO>`
    (não improvise isso na hora — teste antes com um destino descartável).

## 0.2 — Descobrir processo, diretório, usuário e porta

```bash
pm2 list
```

- **Sucesso:** aparece pelo menos um app `online`. Anote `<APPNAME>`.
- **Falha:** `pm2: command not found` ou lista vazia → **o serviço não é PM2.** É o modelo B (Node.js Web App do hPanel). **Vá para o Anexo C.** Não force o caminho PM2.

```bash
pm2 describe <APPNAME>
```

Registre por escrito, do output: `exec cwd` → **`<APPDIR>`** · `script path` · `args` · `restarts` · `interpreter`.

```bash
stat -c '%U:%G %a' <APPDIR>
ps -o user= -p "$(pm2 pid <APPNAME>)"
sudo ss -lntp | grep -i node
```

Registre: **`<APPUSER>`** (dono do diretório **e** do processo — se divergirem, pare e resolva com o dono) e **`<PORT>`** (a porta que aparece no `ss` associada ao PID do PM2).

```bash
curl -s -o /dev/null -w 'health-local=%{http_code}\n' "http://127.0.0.1:<PORT>/api/health"
```

- **Sucesso:** `200`.
- **Falha:** `000`/`connection refused` → `<PORT>` está errada. Volte ao `ss`.

Se houver **mais de um** app PM2 online, confirme qual detém a porta:

```bash
sudo ss -lntp | grep ':<PORT>'    # o PID mostrado tem de ser o de `pm2 pid <APPNAME>`
```

## 0.3 — 🔴 PROVA DE ORIGEM (bloqueante — o passo que a v1 não tinha)

`pm2 list` + `health 200` provam que existe **um** Next nessa máquina. **Não provam que ele é a origem de `atlasaios.com.br`.** Sem esta prova, você pode fazer backup, build e restart num servidor que ninguém serve, ver 307 na Fase 9 e concluir "é cache" — perdendo a janela inteira sem nunca descobrir a causa.

**Mecanismo (verificado no repo):** `proxy.ts:38` tem `matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.[^/]+$).*)"]`. Assets sob `/_next/static/` são excluídos **duas vezes** (pelo prefixo e pela extensão), logo respondem **anonimamente, sem redirect**. E a URL carrega o `BUILD_ID`.

```bash
BID_ANTIGO=$(cat <APPDIR>/.next/BUILD_ID); echo "BUILD_ID atual = $BID_ANTIGO"
ls <APPDIR>/.next/static/"$BID_ANTIGO"/     # confirme que _ssgManifest.js existe

# prova 1 — na ORIGEM, pelo loopback, com o Host do domínio:
curl -s -o /dev/null -w 'origem=%{http_code}\n' -H 'Host: atlasaios.com.br' \
  "http://127.0.0.1:<PORT>/_next/static/$BID_ANTIGO/_ssgManifest.js"

# prova 2 — pelo domínio público (rode da sua máquina ou do servidor):
curl -s -o /dev/null -w 'publico=%{http_code}\n' \
  "https://atlasaios.com.br/_next/static/$BID_ANTIGO/_ssgManifest.js?cb=$(date +%s)"
```

- **✅ APROVADO:** os **dois** dão `200`. Esta máquina, neste `<APPDIR>`, é a origem do domínio.
- **❌ REPROVADO:** `publico` dá `404` → **o build que atende `atlasaios.com.br` não é o desta máquina/diretório.** Você está no servidor errado, ou existe um segundo `<APPDIR>`. **PARE.** Continuar é garantir que o objetivo não será atingido.

Confirmação cruzada (o comportamento da origem tem de ser idêntico ao público de hoje):

```bash
for p in /privacy /terms /data-deletion /dashboard /login; do
  printf "%-16s origem=%s\n" "$p" \
    "$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: atlasaios.com.br' "http://127.0.0.1:<PORT>$p")"
done
```

- **Esperado hoje (antes do deploy):** legais = `307`, `/dashboard` = `307`, `/login` = `200`. Bate exatamente com o público → confirma a origem.

Se for VPS com Nginx, a terceira confirmação (opcional, ainda read-only):

```bash
sudo nginx -T 2>/dev/null | grep -nE 'server_name|proxy_pass' | head -20
grep -rl atlasaios /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null
```

## 0.4 — Recursos: Node, disco, RAM/swap, `.npmrc` (todos com **critério de parada**)

A v1 imprimia esses números sem definir limiar, e mandava "adicionar swap" só no ramo de falha do build — ou seja, com produção já parada.

```bash
node -v
sudo -u <APPUSER> -H bash -lc 'node -v'    # o Node do APPUSER pode ser outro (nvm)
pm2 describe <APPNAME> | grep -iE 'node.js version|interpreter'
```

- **Gate:** as três leituras têm de ser **v20.9 ≤ x < v21** (`engines` do `package.json`). **Não existe `.nvmrc`** no repo nem no ZIP — nada pina a versão no servidor.
- **Falha:** divergência entre o Node do shell e o do PM2 (cenário nvm, regra em VPS) → você builda com um e o PM2 sobe com outro. **Alinhe antes de começar**, nunca depois do build.

```bash
df -BG --output=target,avail <APPDIR> /var/backups /tmp 2>/dev/null || df -h <APPDIR> /var/backups /tmp
du -sh <APPDIR>/node_modules <APPDIR>/.next 2>/dev/null
```

- **Gate de disco (blue/green):** ≥ **5 GB livres** no filesystem do `<APPDIR>`. Referência medida no repo local: `node_modules` = 1,2 GB, `.next` = 151 MB — o blue/green mantém **duas** cópias durante a troca, mais o tarball de backup.
- **Entre 3 e 5 GB:** blue/green fica apertado. Considere o **Anexo B** (deploy in-place com serviço parado), que usa menos disco e mais downtime.
- **Abaixo de 3 GB:** **PARE.** Libere espaço antes de anunciar janela.
- `/var/backups` e `/tmp` também precisam de folga (≥ 1 GB cada).

```bash
free -m | awk '/^Mem:/{print "RAM_MB="$2} /^Swap:/{print "SWAP_MB="$2}'
swapon --show
```

- **Gate:** `RAM + SWAP ≥ 4096 MB`. Este é um build de Next 16 com Turbopack sobre ~1500 arquivos e centenas de páginas pré-renderizadas; numa VPS de 2 GB sem swap o OOM é o desfecho provável, não a exceção.
- **Se faltar, crie swap AGORA (antes da janela), não no meio do build:**
  ```bash
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```

```bash
cat <APPDIR>/.npmrc 2>/dev/null; cat ~/.npmrc 2>/dev/null; cat /etc/npmrc 2>/dev/null
```

- **Sucesso:** nada, ou nada com `engine-strict=true`.
- **Falha:** `engine-strict=true` **e** Node fora de 20.x → `npm ci` aborta com erro (em vez de só avisar `EBADENGINE`). Resolva antes.

## 0.5 — Auditar o ambiente do servidor (somente NOMES e COMPRIMENTO, jamais valores)

```bash
ls -la <APPDIR>/.env <APPDIR>/.env.local <APPDIR>/.env.production <APPDIR>/.env.production.local 2>/dev/null
```

- **Esperado:** só `.env` existe, com permissão `600`.
- **Falha:** existir `.env.local` ou `.env.production` → **eles vencem o `.env`** na precedência do `@next/env`. Descubra por que estão ali antes de qualquer build. (Um `.env.local` residual também é o que tornaria executável o `npm run auth:official:reset`, que usa `--env-file=.env.local`.)

⚠️ **Correção da v1:** o `awk` antigo (`length($0)>length($1)+1 ? "DEFINIDA":"VAZIA"`) tinha dois defeitos que quebravam justamente o gate do risco crítico R1. Reportava **DEFINIDA** para `CHAVE=""`, `CHAVE=` + espaço e `CHAVE=COLE_AQUI` — e `utils/supabase/env.ts:5` testa `!url || !key` (falsy), então string vazia cai no placeholder do mesmo jeito. E a âncora `^[A-Za-z_]` não casava `export CHAVE=...`, escondendo o `ATLAS_BOOTSTRAP_SECRET` num `.env` em estilo export. Versão corrigida:

```bash
sudo awk -F= '
/^[[:space:]]*(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*=/{
  k=$1; sub(/^[[:space:]]*export[[:space:]]+/,"",k); sub(/^[[:space:]]+/,"",k);
  v=substr($0, index($0,"=")+1);
  gsub(/^[[:space:]]*["\047]?|["\047]?[[:space:]]*$/,"",v);
  printf "%s = %s (%d chars)\n", k, (length(v)>0 ? "DEFINIDA" : "VAZIA"), length(v)
}' <APPDIR>/.env
```

Confirme `DEFINIDA` (e comprimento plausível) em:
`NEXT_PUBLIC_SUPABASE_URL` (> 20 chars), `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` **ou** `NEXT_PUBLIC_SUPABASE_ANON_KEY` (> 30 chars), `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `ATLAS_CRON_SECRET`, `ATLAS_BASE_URL`, `ATLAS_ENV`, `ATLAS_ENVIRONMENT_ID`, `ATLAS_DATABASE_ENVIRONMENT`, `ATLAS_HOSTING_PROVIDER`, `OPENAI_API_KEY`.

- **Falha bloqueante:** qualquer `NEXT_PUBLIC_SUPABASE_*` ausente/`VAZIA`/suspeita, ou `DATABASE_URL` ausente → **NÃO BUILDE.** Peça ao dono para preencher direto no servidor (editor no host, nunca por commit, nunca dentro do ZIP).
  - `DATABASE_URL` entra no gate porque o Passo 5.8 roda `npm run prisma:generate`, e `prisma.config.ts` faz `import "dotenv/config"` e lê `process.env["DATABASE_URL"]`. Sem ela, o `prisma generate` falha no meio da janela.
- **Registro de segurança:** se aparecer `ATLAS_BOOTSTRAP_SECRET`, `ATLAS_TEST_EMAIL` ou `ATLAS_TEST_PASSWORD`, anote — o Passo 5.7 remove as três **do `.env` do diretório novo** (o `.env` vivo continua intacto até a troca).

## 0.6 — Registrar (não corrigir) resíduo de build anterior

```bash
ls -la <APPDIR>/.atlas-route-quarantine.lock 2>/dev/null || echo "LOCK AUSENTE (ok)"
ls -d <APPDIR>/.atlas-route-quarantine-build-* 2>/dev/null || echo "SEM QUARENTENA PENDENTE (ok)"
```

- **Sucesso:** as duas linhas de "ok".
- **Achado:** algo aparece → **REGISTRE e NÃO execute o Anexo A agora.** No blue/green, esse lock **não impede** o build (que acontece em outro diretório, com outro lock). Mas ele indica que a árvore de rotas do `<APPDIR>` vivo pode estar incompleta, o que afeta o **rollback**. Trate no ponto indicado da Fase 5 (5.0), depois de o backup existir.

## 0.7 — Decisão do dono sobre o ambiente lógico (R4)

```bash
pm2 describe <APPNAME> | grep -iE 'script|args|cwd|node env|ATLAS_'
```

Compare com o `ecosystem.config.cjs` do pacote (conteúdo verificado):

```
name: "atlas-v3-homolog"   script: "node_modules/next/dist/bin/next"   args: "start -p 3000"
instances: 1   exec_mode: "fork"   autorestart: true   max_memory_restart: "1G"
env: { NODE_ENV: production, ATLAS_ENV: homologation,
       ATLAS_ENVIRONMENT_ID: atlas-v3-hostinger-homolog,
       ATLAS_DATABASE_ENVIRONMENT: homologation, ATLAS_HOSTING_PROVIDER: hostinger }
```

⚠️ **Decisão obrigatória, por escrito, antes de continuar.** Três coisas nesse arquivo colidem com produção: o **nome** (`atlas-v3-homolog`), a **porta** (`-p 3000`) e o **`ATLAS_ENV=homologation`**.

- **Opção B (padrão desta v2, mais conservadora):** preservar integralmente a configuração PM2 de produção. O `ecosystem.config.cjs` do pacote **não** é aplicado; o diretório novo recebe uma cópia do ecosystem que já está em produção (Passo 5.3).
- **Opção A (só se `<APPNAME>` == `atlas-v3-homolog` **e** `<PORT>` == `3000` **e** o dono aceitar `ATLAS_ENV=homologation` em domínio público):** aplicar o ecosystem do pacote, e **nunca com `pm2 restart <arquivo>`** — ver Fase 6.

---

# FASE 1 — Preparar na máquina local

## 1.1 — Confirmar que o ZIP corresponde ao HEAD

```bash
cd /Users/thiagoribasdavila/atlas-v3
git rev-parse HEAD
git status --porcelain --untracked-files=no | wc -l
shasum -a 256 dist/hostinger/atlas-v3-hostinger-homologation.zip
cat dist/hostinger/atlas-v3-hostinger-homologation.zip.sha256
```

- **Sucesso:** HEAD = `437d3b117063476e8eb1e998ac62a9581a8a5d1c`; contagem = `0`; os dois hashes = `e1f58990ed94ec2351a05b3781c11caa0a935bc2b790bcc09217af2273366e1f`. *(Os três foram medidos hoje e conferem.)*
- **Falha:** hash divergente → regenere com o Passo 1.3.

## 1.2 — Gate do pacote + gate de segredo (agora **obrigatório**)

```bash
cd /Users/thiagoribasdavila/atlas-v3
ATLAS_PACKAGE_NAME=atlas-v3-hostinger-homologation.zip node scripts/verify-hostinger-package.mjs
npm run security:secrets
unzip -Z1 dist/hostinger/atlas-v3-hostinger-homologation.zip \
  | grep -E '(^|/)\.env' | grep -v '^\.env\.example$' \
  && echo "ABORTAR: arquivo de ambiente dentro do ZIP" \
  || echo "ZIP sem arquivo de ambiente (ok)"
```

⚠️ **`ATLAS_PACKAGE_NAME` é obrigatório.** O empacotador tem default `…homologation.zip`, mas o verificador tem default `…final.zip` — sem a variável você verifica o artefato errado.

⚠️ **Por que `security:secrets` saiu de "opcional" para "obrigatório":** a regex de conteúdo proibido dos dois scripts de pacote (`package-hostinger.mjs` e `verify-hostinger-package.mjs`) bloqueia apenas `.env.local`, `hostinger.env`, `node_modules`, `.next`, `tmp`, `outputs`, `dist`, `.git` e extensões `xlsx|csv|pdf|pem`. Ela **não bloqueia** `.env`, `.env.production` nem `.env.hostinger`. Um `git add -f .env.hostinger` (que fura o `.gitignore`) faria o `git archive HEAD` embarcar segredos reais e o verificador ainda imprimiria `{"ok":true}`. Quem pega isso é `scripts/scan-secrets.mjs` (regra `/^\.env(?:\.|$)/ && file !== ".env.example"`). **Verificado hoje: o ZIP atual está limpo — única entrada de ambiente é `.env.example`.** Mas o gate precisa ser rodado, não presumido.

- **Sucesso:** `{"ok":true,"files":1559,"commit":"437d3b11…","inventoryEntries":1558}`, `security:secrets` exit 0, e "ZIP sem arquivo de ambiente (ok)".
- **Falha:** qualquer `Error:` → **não suba este ZIP.**

## 1.3 — (Só se precisar regerar)

```bash
cd /Users/thiagoribasdavila/atlas-v3
git status --untracked-files=all        # confirme que não há arquivo novo esquecido
ATLAS_PACKAGE_NAME=atlas-v3-hostinger-homologation.zip npm run package:hostinger
```

O empacotador aborta se houver alteração **versionada** sem commit. ⚠️ **Arquivos novos ainda não rastreados pelo git são ignorados em silêncio** e não entram no ZIP. Depois de regerar, refaça 1.1 e 1.2 — o hash muda.

## 1.4 — Gates rápidos (segundos, fail-fast)

```bash
cd /Users/thiagoribasdavila/atlas-v3
node scripts/check-legal-pages.mjs
```

- **Sucesso:** `check-legal-pages: 47 passaram, 0 falharam`, exit 0. *(Rodado hoje: confere.)*
- **Falha:** qualquer caso reprovado → o código das páginas legais regrediu. Corrija antes de subir.

⚠️ Este gate é **100% offline**: prova que o *código* libera as rotas, não que o *servidor publicado* libera. Só as Fases 7 e 9 provam isso.

## 1.5 — `validate:deploy` — **OBRIGATÓRIO** (era "opcional" na v1)

```bash
cd /Users/thiagoribasdavila/atlas-v3
npm run validate:deploy
```

Nome com **dois-pontos**. Requer: rodar da raiz, ter rede (faz `npm audit`), ter `.env.local`, e **não** ter `npm run dev` ativo na mesma pasta (lock exclusivo de quarentena).

**Por que virou obrigatório:** o delta entre produção (~17/07) e o HEAD é de **282 commits**, não "algumas mudanças de 4 dias" (R11). Se uma regressão de qualquer um deles aparecer só na Fase 9, o desfecho é rollback — e o objetivo das 3 URLs se perde junto. É mais barato reprovar aqui.

- **Sucesso:** `GATE DE DEPLOY APROVADO` + lista de lacunas conhecidas (não bloqueiam, por desenho).
- **Falha:** exit 1 listando os passos reprovados. A saída de cada passo é descartada (`stdio: "pipe"`) — re-execute o passo isolado para ver o erro real.
- ⚠️ A mensagem final menciona "empacotamento", mas o script **não contém** passo de package/hostinger. O gate do pacote é o Passo 1.2, separado.
- **Waiver:** se o dono decidir seguir com o gate reprovado, isso tem de ser registrado por escrito, com o motivo, **antes** da Fase 2. Não é decisão do operador.

## 1.6 — Sobre `package:hostinger:clean-build`

❌ **Não rode nesta rodada.** `scripts/test-hostinger-package-build.mjs:7` aponta para `atlas-v3-hostinger-final.zip` (artefato de 18/jul, commit `8f863e4`) — testaria um pacote que não vai subir, e ainda copia o `.env.local` real para `/tmp`. O ensaio de build limpo desta release é o próprio build da Fase 5.

---

# FASE 2 — Transferir (ZIP + checksum juntos)

```bash
cd /Users/thiagoribasdavila/atlas-v3/dist/hostinger
scp atlas-v3-hostinger-homologation.zip atlas-v3-hostinger-homologation.zip.sha256 <SSH_DESTINO>:/tmp/
```

Envie **sempre os dois arquivos**. Nenhum runbook do repo instrui a conferir integridade no destino — este instrui.

No servidor (dentro do tmux):

```bash
cd /tmp && sha256sum -c atlas-v3-hostinger-homologation.zip.sha256
```

- **Sucesso:** `atlas-v3-hostinger-homologation.zip: OK`
- **Falha:** `FAILED` → transferência corrompida. Reenvie. **Não extraia.**

🚫 **Não transfira nenhum arquivo `.env`.** Se faltar variável, o dono edita `<APPDIR>/.env` diretamente no host.

---

# FASE 3 — Anunciar a janela e fixar a hora de corte

A v1 tinha aqui um parágrafo de uma linha, sem artefato e sem critério de aborto — o que produz "produção no ar pela metade às 23h".

1. **Avise os usuários.**
2. **Fixe uma hora de corte absoluta, por escrito.** Regra: *"se às `<HH:MM>` a Fase 6 (troca) ainda não tiver acontecido, execute o Rollback e reagende."* No blue/green, abortar antes da Fase 6 é **gratuito** — a produção nunca foi tocada. Use isso.
3. **Downtime esperado:** segundos (tempo do `mv` + boot do Next), não o build inteiro. Confirme o boot real do seu servidor no Passo 6.3.
4. **Página de manutenção:** só faz sentido se houver Nginx próprio na frente (modelo A). **Não sabemos se há** — confirmar no servidor no Passo 0.3. Se houver, e o dono quiser, suba-a **imediatamente antes da Fase 6** e remova logo após o Passo 7.1. Se não houver, o downtime de segundos dispensa.

---

# FASE 4 — BACKUP OBRIGATÓRIO

**Não pule.** É o caminho de volta caso a troca da Fase 6 dê errado.

## 4.0 — Carimbo persistido + diretório de backup blindado

⚠️ **Correção da v1:** o `export TS=…` da v1 vivia num shell que evaporava ao abrir o tmux da fase de build, gerando `/tmp/atlas-build-.log` e obrigando o operador a lembrar de cabeça um timestamp de 15 dígitos no momento de maior pressão. Agora o carimbo mora em disco.

⚠️ **Correção da v1 (R16):** `sudo mkdir -p` cria `755` e o `tar` sai `644` — e o tarball **contém o `.env` de produção** (`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `ATLAS_CRON_SECRET`, e possivelmente `ATLAS_BOOTSTRAP_SECRET`). A v1 protegia o `env-$TS.bak` com `chmod 600` e publicava o mesmo conteúdo em modo mundo-legível pela porta ao lado.

```bash
sudo install -d -m 700 -o root -g root /var/backups/atlas
export TS=$(date +%Y%m%d-%H%M%S)
echo "$TS" | sudo tee /var/backups/atlas/CURRENT_TS >/dev/null
echo "TS=$TS"
```

**Em todo shell novo (reattach do tmux, Rollback, dia seguinte), a primeira linha é:**

```bash
export TS=$(sudo cat /var/backups/atlas/CURRENT_TS); echo "TS=$TS"
[ -n "$TS" ] || echo "TS VAZIO - PARE"
```

## 4.1 — Fotografar a versão no ar

```bash
cat <APPDIR>/.next/BUILD_ID | sudo tee /var/backups/atlas/BUILD_ID-antes-$TS.txt
sudo chmod 600 /var/backups/atlas/BUILD_ID-antes-$TS.txt
```

## 4.2 — Backup do código + build atuais (sem `node_modules`), com permissão fechada

```bash
cd "$(dirname <APPDIR>)" \
  && ( umask 077; sudo tar --exclude='node_modules' -czf /var/backups/atlas/atlas-app-$TS.tar.gz "$(basename <APPDIR>)" ) \
  && sudo chmod 600 /var/backups/atlas/atlas-app-$TS.tar.gz \
  && sudo ls -l /var/backups/atlas/
```

- **Sucesso:** arquivo criado, `-rw-------`, tamanho > 100 MB (inclui `.next`).
- **Falha:** `No space left on device` → libere espaço. **Não prossiga sem backup.**

## 4.3 — Validar o backup **de verdade**

⚠️ **Correção da v1:** a v1 validava com `tar -tzf … | head -5`, que faz o `tar` receber `SIGPIPE` após 5 linhas e nunca ler o arquivo até o fim. Um tarball truncado (SSH caído, disco cheio) passava imprimindo 5 nomes felizes. O único passo que validava o backup não validava o backup.

```bash
sudo tar -tzf /var/backups/atlas/atlas-app-$TS.tar.gz > /tmp/tar-manifest-$TS.txt 2>/tmp/tar-err-$TS.txt \
  && echo "TAR_INTEGRO_OK" || echo "TAR CORROMPIDO - REFACA O BACKUP"
grep -c '\.next/' /tmp/tar-manifest-$TS.txt
grep -c 'package.json' /tmp/tar-manifest-$TS.txt
cat /tmp/tar-err-$TS.txt
```

- **Sucesso:** `TAR_INTEGRO_OK`, contagem de `.next/` > 0, `package.json` ≥ 1, e `tar-err` vazio.
- **Falha:** qualquer outra coisa → refaça o Passo 4.2. **Não avance.**

## 4.4 — Congelar a configuração do PM2 (com redação de segredo)

⚠️ **Correção da v1:** `pm2 describe` imprime a seção *"Divergent env variables"*, que lista **nomes e valores (truncados)** — exatamente onde estão `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` e `ATLAS_BOOTSTRAP_SECRET`. A v1 redirecionava isso para `/tmp` com umask padrão (mundo-legível) e ainda dava `cat` na tela.

```bash
pm2 save
sudo cp -a ~/.pm2/dump.pm2 /var/backups/atlas/dump-$TS.pm2 && sudo chmod 600 /var/backups/atlas/dump-$TS.pm2

( umask 077; pm2 describe <APPNAME> \
   | sed -E 's/((KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL|SERVICE_ROLE)[A-Z_]*)([[:space:]│|]+).*/\1\3[REDIGIDO]/I' \
   | sudo tee /var/backups/atlas/pm2-describe-antes-$TS.txt >/dev/null )
sudo chmod 600 /var/backups/atlas/pm2-describe-antes-$TS.txt
sudo head -40 /var/backups/atlas/pm2-describe-antes-$TS.txt
```

O `dump-$TS.pm2` é o que permite **restaurar o ambiente lógico** do processo no rollback (R20) — a v1 restaurava o código e deixava a produção em `homologation`.

---

# FASE 5 — Montar a release nova **ao lado** (blue/green) · produção intocada

> **Nada nesta fase toca `<APPDIR>`.** Você pode abortar a qualquer momento sem consequência: basta apagar o diretório novo. A produção só muda na Fase 6.

## 5.0 — (Condicional) Quarentena pendente registrada no Passo 0.6

Se o Passo 0.6 encontrou lock ou diretório de quarentena no `<APPDIR>` vivo, **agora** — com o backup da Fase 4 já validado — é o momento de tratar: vá ao **Anexo A**, volte, e siga. Isso não bloqueia o build novo (que roda em outro diretório), mas garante que o `<APPDIR>` para o qual você pode ter de voltar está íntegro.

## 5.1 — Criar o diretório da release nova

```bash
export NEWDIR=<APPDIR>.new-$TS
sudo install -d -m 755 -o <APPUSER> -g <APPUSER> "$NEWDIR"
sudo -u <APPUSER> -H bash -lc "unzip -q -o /tmp/atlas-v3-hostinger-homologation.zip -d '$NEWDIR' && mkdir -p '$NEWDIR/logs'"
ls -la "$NEWDIR" | head -20
```

O `mkdir -p logs` é necessário: **o empacotador exclui `logs/` do ZIP** (verificado), e o ecosystem grava em `./logs/atlas-v3-out.log`.

## 5.2 — Conferir a extração contra o inventário (critério binário)

⚠️ **Correção da v1:** a v1 dizia que a saída teria "ruído de arquivos preexistentes que não estão no inventário, que você pode ignorar". **Isso é falso** — `sha256sum -c` verifica **apenas** os arquivos listados, então esse ruído não existe. A frase treinava o operador a ignorar linhas `FAILED` reais, que é justamente o sintoma de extração incompleta por permissão. Além disso o `head -20` truncava e o exit code sumia no pipe.

```bash
cd "$NEWDIR" && sudo -u <APPUSER> -H sha256sum -c --quiet RELEASE_FILES.sha256 > /tmp/relcheck-$TS.txt 2>&1
echo "CHECK_EXIT=$?"; wc -l < /tmp/relcheck-$TS.txt
```

- **✅ Sucesso:** `CHECK_EXIT=0` **e** `0` linhas.
- **❌ Falha:** qualquer linha → extração incompleta/corrompida. Apague `$NEWDIR` e refaça o 5.1.

## 5.3 — Escolher o `ecosystem.config.cjs` do diretório novo (decisão do Passo 0.7)

⚠️ **Correção da v1:** na v1, o `unzip -o` sobrescrevia o `ecosystem.config.cjs` de produção **várias fases antes** de o dono decidir, na Fase 7, se queria `ATLAS_ENV=homologation`. A "Opção B — preservar a configuração atual" preservava só o que estava na memória do PM2; o arquivo em disco já era o do pacote, e qualquer `pm2 resurrect` após reboot reintroduzia o `homologation` — exatamente o risco R4, classificado como crítico. No blue/green isso não acontece por acidente; é uma escolha explícita:

```bash
# preserve sempre uma cópia do ecosystem que está EM PRODUÇÃO:
sudo cp -a <APPDIR>/ecosystem.config.cjs /var/backups/atlas/ecosystem-prod-$TS.cjs 2>/dev/null \
  && sudo chmod 600 /var/backups/atlas/ecosystem-prod-$TS.cjs \
  || echo "sem ecosystem.config.cjs em producao (registre)"
```

- **Opção B (padrão):** o diretório novo usa o ecosystem **de produção**:
  ```bash
  sudo cp -a /var/backups/atlas/ecosystem-prod-$TS.cjs "$NEWDIR/ecosystem.config.cjs"
  sudo chown <APPUSER>:<APPUSER> "$NEWDIR/ecosystem.config.cjs"
  ```
- **Opção A (só se o Passo 0.7 autorizou):** mantenha o ecosystem que veio do ZIP. Confirme antes que `name` e a porta batem com `<APPNAME>`/`<PORT>`:
  ```bash
  grep -nE 'name|args' "$NEWDIR/ecosystem.config.cjs"
  ```

## 5.4 — Instalar o `.env` no diretório novo e provar que é o mesmo

```bash
sudo cp -a <APPDIR>/.env "$NEWDIR/.env"
sudo chown <APPUSER>:<APPUSER> "$NEWDIR/.env" && sudo chmod 600 "$NEWDIR/.env"
sudo sha256sum <APPDIR>/.env "$NEWDIR/.env" | awk '{print $1}' | uniq -c
```

- **Sucesso:** `2` na contagem (hashes idênticos). O hash **não é segredo**; o conteúdo nunca aparece.
- Confirme também que **não** existe `.env.local`/`.env.production` no diretório novo:
  ```bash
  ls -la "$NEWDIR"/.env.local "$NEWDIR"/.env.production "$NEWDIR"/.env.production.local 2>/dev/null || echo "só .env (ok)"
  ```

Reconfirme as variáveis críticas **no `.env` do diretório novo**, agora incluindo `DATABASE_URL`:

```bash
sudo awk -F= '
/^[[:space:]]*(export[[:space:]]+)?(NEXT_PUBLIC_SUPABASE_(URL|PUBLISHABLE_KEY|ANON_KEY)|DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY|ATLAS_BASE_URL)=/{
  k=$1; sub(/^[[:space:]]*export[[:space:]]+/,"",k);
  v=substr($0, index($0,"=")+1); gsub(/^[[:space:]]*["\047]?|["\047]?[[:space:]]*$/,"",v);
  printf "%s = %s (%d chars)\n", k, (length(v)>0 ? "DEFINIDA" : "VAZIA"), length(v)
}' "$NEWDIR/.env"
```

- **✅ Sucesso:** `NEXT_PUBLIC_SUPABASE_URL` DEFINIDA (> 20 chars) **e** pelo menos uma entre `PUBLISHABLE_KEY`/`ANON_KEY` DEFINIDA (> 30 chars) **e** `DATABASE_URL` DEFINIDA.
- **❌ Falha:** qualquer `VAZIA`/ausente → **PARE.** `utils/supabase/env.ts:6-8` troca a ausência por `atlas-build-placeholder-not-a-real-key` na fase de build; o build sai com **exit 0** e o login quebra para todos. Corrigir o `.env` depois **não resolve** — exige rebuild inteiro.

## 5.5 — Provar que o shell do build está limpo (variante de R1 que a v1 não cobria)

O `@next/env` dá precedência ao **ambiente do processo** sobre o `.env`. Se a sessão SSH, o `~/.bashrc` do `<APPUSER>` ou um `export` de tentativa anterior tiver `NEXT_PUBLIC_SUPABASE_*` com valor antigo ou de outro projeto Supabase, é **esse** valor que vai para o bundle. Nesse cenário o grep do placeholder dá 0, o smoke fica verde, a Fase 9 fica verde e até o login manual "funciona" — apontando para o banco errado.

```bash
sudo -u <APPUSER> -H bash -lc 'env | grep -o "^NEXT_PUBLIC_[A-Z0-9_]*"; echo "total_next_public=$(env | grep -c "^NEXT_PUBLIC_")"; echo "NODE_ENV=[${NODE_ENV:-vazio}]"; node -v'
```

- **✅ Sucesso:** `total_next_public=0`, `NODE_ENV=[vazio]`, Node v20.x.
- **❌ Falha:** total ≠ 0 → `unset` cada nome listado (só nomes são impressos, nunca valores) antes de buildar.
- `NODE_ENV=production` exportado não impede o build (o `--include=dev` do Passo 5.8 compensa), mas registre.

## 5.6 — Remover do servidor os scripts destrutivos que o pacote embarca (R15)

Confirmado por `unzip -Z1`: o ZIP contém `scripts/reset-official-auth-rbac.mjs` e `scripts/bootstrap-admin.mjs`.

**Honestidade sobre a severidade:** o script de reset tem **dois** guards além do ambiente — exige `--confirm=RESET_AND_INVITE_OFFICIAL_USERS` e é invocado por `npm run auth:official:reset`, que usa `node --env-file=.env.local` (e `.env.local` **não deve existir** no servidor). Então o disparo acidental é menos trivial do que "um tab-completion errado". Ainda assim: o guard de ambiente é `ATLAS_ENV !== "homologation"` — **exatamente o valor que a Opção A do Passo 0.7 forçaria** — e o efeito é banir todos os `auth.users` por 100 anos e desativar todos os `profiles` da organização viva (~17.151 leads). **Remover custa zero e elimina a classe inteira do problema:**

```bash
sudo -u <APPUSER> -H bash -lc "rm -f '$NEWDIR/scripts/reset-official-auth-rbac.mjs' '$NEWDIR/scripts/bootstrap-admin.mjs'"
ls "$NEWDIR"/scripts/reset-official-auth-rbac.mjs 2>/dev/null && echo "AINDA PRESENTE - PARE" || echo "removido (ok)"
```

Os aliases continuam no `package.json` (`auth:official:reset`, `bootstrap:admin`), mas agora falham por arquivo inexistente, que é o modo de falha desejado. **Correção de fundo, fora desta janela:** adicionar `scripts/reset-official-auth-rbac.mjs` à lista de remoção de `scripts/package-hostinger.mjs`, para que nenhuma release futura volte a embarcá-lo.

## 5.7 — Fechar o caminho de bootstrap de admin **antes** do restart (R4/R12)

A v1 detectava `ATLAS_BOOTSTRAP_SECRET` no reconhecimento, mandava explicitamente **não** remover, e adiava para "as 24h seguintes" — criando de propósito uma janela de 24h com um endpoint de **criação de administrador** ativo em domínio público. Verificado em `app/api/bootstrap/admin/route.ts:11-21`: a rota é autorizada quando `ATLAS_ENV ∈ (development, homologation)` **e** `ATLAS_BOOTSTRAP_SECRET` existe com ≥ 32 chars.

No blue/green o custo de antecipar é **zero e sem risco**: a edição é no `.env` do diretório **novo**; o `.env` vivo permanece intacto para o rollback.

```bash
sudo cp -a "$NEWDIR/.env" /var/backups/atlas/env-novo-antes-purge-$TS.bak && sudo chmod 600 /var/backups/atlas/env-novo-antes-purge-$TS.bak
sudo sed -i -E '/^[[:space:]]*(export[[:space:]]+)?(ATLAS_BOOTSTRAP_SECRET|ATLAS_TEST_EMAIL|ATLAS_TEST_PASSWORD)=/d' "$NEWDIR/.env"
sudo chown <APPUSER>:<APPUSER> "$NEWDIR/.env" && sudo chmod 600 "$NEWDIR/.env"
sudo awk -F= '/^[[:space:]]*(export[[:space:]]+)?(ATLAS_BOOTSTRAP_SECRET|ATLAS_TEST_EMAIL|ATLAS_TEST_PASSWORD)=/{print "AINDA PRESENTE: "$1}' "$NEWDIR/.env"
sudo wc -l < "$NEWDIR/.env"   # compare com o .env vivo: deve ter no máximo 3 linhas a menos
```

- **✅ Sucesso:** o `awk` não imprime nada e a contagem de linhas caiu no máximo 3.
- **Se o primeiro admin ainda NÃO existe** e o dono precisa do bootstrap, **não remova** — registre a exceção por escrito e trate como pendência de 24h. Decisão do dono.

## 5.8 — Instalar dependências e buildar (o passo demorado) — **como `<APPUSER>`**

⚠️ **Correção da v1 (R17/R18):** a v1 usava `sudo` na fase de backup e ficava muda sobre qual usuário rodaria `unzip`/`npm ci`/`build`. O caminho natural de quem acabou de dar `sudo tar` é rodar tudo como root — e aí `.next`, `node_modules` e `logs/` ficam root-owned enquanto o PM2 roda como `<APPUSER>`, produzindo falhas intermitentes de cache/ISR sem log claro, verdes em todo o smoke. O único `chown -R` da v1 estava no rollback, não no caminho feliz.

```bash
sudo -u <APPUSER> -H bash -lc "cd '$NEWDIR' && npm ci --include=dev"
```

⚠️ `--include=dev` é **obrigatório**: com `NODE_ENV=production` exportado, `npm ci` pula devDependencies e o build morre por falta de `typescript`, `tailwindcss`, `@tailwindcss/postcss` e do CLI `prisma`.

- **Sucesso:** `added NNNN packages`, exit 0. `EBADENGINE` como **aviso** é tolerável se não houver `engine-strict` (Passo 0.4).
- **Falha:** `EBADENGINE` como **erro** → `.npmrc` com `engine-strict=true` + Node fora de 20.x. `ETIMEDOUT`/`ENOTFOUND` → sem rede para o registry; o pacote não traz cache offline. **Em ambos os casos a produção segue intacta** — este é o ganho do blue/green.

```bash
sudo -u <APPUSER> -H bash -lc "cd '$NEWDIR' && npm run prisma:generate"
```

- **Sucesso:** `Generated Prisma Client`.
- **Falha:** `prisma: not found` → devDependencies não instaladas. `Environment variable not found: DATABASE_URL` → volte ao 5.4.

```bash
sudo -u <APPUSER> -H bash -lc "cd '$NEWDIR' && ( umask 077; set -o pipefail; npm run build 2>&1 | tee \$HOME/atlas-build-$TS.log; echo BUILD_EXIT=\${PIPESTATUS[0]} )"
```

Se a RAM for menor que ~3 GB (e você já criou swap no Passo 0.4):

```bash
sudo -u <APPUSER> -H bash -lc "cd '$NEWDIR' && ( umask 077; set -o pipefail; NODE_OPTIONS=--max-old-space-size=1536 npm run build 2>&1 | tee \$HOME/atlas-build-$TS.log; echo BUILD_EXIT=\${PIPESTATUS[0]} )"
```

⚠️ **Correção da v1:** a v1 pedia `npm run build … | tee …` e declarava "exit 0" como critério. Com o pipe, o status observado é o do `tee`, praticamente sempre 0 — um build que falha depois de milhares de linhas parecia bem-sucedido. Como `scripts/build.mjs` apenas propaga o status via `process.exitCode` (não lança), a falha era silenciosa. **Agora o critério é `BUILD_EXIT=0`, explícito.** O log também saiu de `/tmp` (mundo-legível) para o `$HOME` do `<APPUSER>`, com `umask 077`.

- **✅ Sucesso:** `BUILD_EXIT=0`, `✓ Compiled successfully`, `Generating static pages`, e `$NEWDIR/.next/BUILD_ID` existe.
- **❌ Falhas comuns:**
  - `Outra execução Atlas está ativa (PID x)` → lock preso **no `$NEWDIR`** → **Anexo A**, aplicado ao `$NEWDIR`;
  - `Killed` / exit 137 → OOM killer. Confirme swap (Passo 0.4) e reduza `--max-old-space-size`. **O lock provavelmente ficou preso → Anexo A antes de tentar de novo**;
  - erro de tipo/lint → o build para. **Produção continua no ar, intocada.** Aborte a janela e investigue com calma; não há nada a reverter.

## 5.9 — Verificar o bundle ANTES de qualquer troca (gate crítico de R1)

⚠️ **Correção da v1 — os dois auditores discordaram, e aqui usamos as duas checagens.** A v1 usava só um grep **negativo** do placeholder. Medido no build local saudável: a string aparece **3 vezes em `.next/server`** (é o literal do código-fonte de `utils/supabase/env.ts`) e **0 vezes em `.next/static`**. Ou seja, o grep na pasta errada reprova um build correto, e a ausência em `static` depende do minificador eliminar o ramo morto. A checagem **positiva** é mais robusta; mantemos a negativa como sinal secundário, **estritamente restrita a `.next/static`**.

```bash
cd "$NEWDIR"
echo "BUILD_ID_NOVO=$(cat .next/BUILD_ID)"
echo "BUILD_ID_ANTIGO=$(sudo cat /var/backups/atlas/BUILD_ID-antes-$TS.txt)"

# POSITIVO (principal) — o host real do Supabase foi inlinado no bundle do cliente:
echo "supabase.co em static = $(grep -rl 'supabase\.co' .next/static 2>/dev/null | wc -l)"
# NEGATIVO (principal) — o host de fallback local NÃO pode estar no bundle:
echo "127.0.0.1:54321 em static = $(grep -rl '127\.0\.0\.1:54321' .next/static 2>/dev/null | wc -l)"
# NEGATIVO (secundário) — só em static, NUNCA em server:
echo "placeholder em static = $(grep -rl 'atlas-build-placeholder-not-a-real-key' .next/static 2>/dev/null | wc -l)"
```

- **✅ APROVADO:** `BUILD_ID_NOVO` **diferente** do antigo · `supabase.co ≥ 1` · `127.0.0.1:54321 = 0` · `placeholder em static = 0`. *(Exatamente os números medidos no build local saudável.)*
- **🔴 REPROVADO:** `supabase.co = 0` **ou** `127.0.0.1:54321 > 0` **ou** `placeholder > 0` → o bundle do navegador saiu com credencial falsa. **Não troque nada.** Volte ao 5.4/5.5 e refaça o build. Subir assim quebra o login de todos os usuários. Novamente: **produção segue intacta.**

Páginas legais pré-renderizadas — **as três** (a v1 esquecia `terms.html`, uma das três URLs que são o objetivo da operação):

```bash
ls -l "$NEWDIR"/.next/server/app/privacy.html "$NEWDIR"/.next/server/app/terms.html "$NEWDIR"/.next/server/app/data-deletion.html
grep -c 'atlasaios.com.br/privacy' "$NEWDIR"/.next/server/app/privacy.html
grep -c 'data-deletion' "$NEWDIR"/proxy.ts
```

- **✅ Sucesso:** os três arquivos existem e são grandes (referência do build local: 66 KB / 50 KB / 33 KB); o canonical aparece ≥ 1 vez; `proxy.ts` menciona `data-deletion` ≥ 1 vez.
- **❌ Falha:** ausente ou vazio → o build não incluiu as páginas. Não troque; investigue.

Arquivo de roteamento concorrente (impossível vindo do ZIP limpo, mas confirme — custa nada):

```bash
ls -d "$NEWDIR"/middleware.ts "$NEWDIR"/middleware.js "$NEWDIR"/src/proxy.ts "$NEWDIR"/src/middleware.ts "$NEWDIR"/src/app 2>/dev/null \
  || echo "SEM ARQUIVO DE ROTEAMENTO CONCORRENTE (ok)"
```

## 5.10 — Propriedade e escrita antes da troca

```bash
sudo chown -R <APPUSER>:<APPUSER> "$NEWDIR"
sudo chmod 600 "$NEWDIR/.env"
sudo -u <APPUSER> test -w "$NEWDIR/.next" && sudo -u <APPUSER> test -w "$NEWDIR/logs" && echo "PERMISSOES_OK" || echo "PERMISSAO ERRADA - NAO TROQUE"
ls "$NEWDIR"/node_modules/next/dist/bin/next && echo "binario next presente (ok)"
```

- **✅ Sucesso:** `PERMISSOES_OK` e o binário do Next existe (é o `script` do ecosystem).

> ### ✋ **PONTO DE NÃO RETORNO**
> Tudo até aqui é reversível a custo zero: `sudo rm -rf "$NEWDIR"` e a produção nunca soube que houve deploy.
> **Só avance para a Fase 6 se todos os critérios de 5.2, 5.4, 5.5, 5.8, 5.9 e 5.10 estiverem ✅.**
> Se a hora de corte da Fase 3 já passou, **aborte agora** — é grátis.

---

# FASE 6 — Troca atômica e restart (a única fase que toca produção)

## 6.1 — Pré-condições (verifique, não presuma)

```bash
export TS=$(sudo cat /var/backups/atlas/CURRENT_TS); echo "TS=$TS"
export NEWDIR=<APPDIR>.new-$TS
sudo ls -l /var/backups/atlas/atlas-app-$TS.tar.gz     # backup existe e é -rw-------
sudo ls -l /var/backups/atlas/dump-$TS.pm2             # dump do PM2 existe
ls "$NEWDIR/.next/BUILD_ID" && cat "$NEWDIR/.next/BUILD_ID"
sudo ss -lntp | grep ':<PORT>'                          # anote o PID atual
```

Todas têm de passar. Se alguma falhar, **não troque**.

## 6.2 — Parar, trocar, subir

```bash
pm2 stop <APPNAME> \
  && sudo mv <APPDIR> <APPDIR>.old-$TS \
  && sudo mv "$NEWDIR" <APPDIR> \
  && sudo chmod 700 <APPDIR>.old-$TS \
  && echo "TROCA OK"
```

O encadeamento com `&&` garante que, se o `pm2 stop` ou o primeiro `mv` falhar, o segundo `mv` **não** roda — evitando o estado híbrido irrecuperável que a v1 permitia.

- **Se o segundo `mv` falhar** (permissão, disco): desfaça imediatamente com `sudo mv <APPDIR>.old-$TS <APPDIR> && pm2 start <APPNAME>` e investigue.

## 6.3 — Subir o processo — **sem `--update-env`**

⚠️ **Contradição entre auditores, resolvida pela opção mais conservadora.** A v1 afirmava que `--update-env` é "necessário para que rotações de chave no `.env` tenham efeito". **A afirmação é incorreta:** quem lê o `.env` é o `@next/env`, a cada boot do `next start`, com ou sem a flag. O que `--update-env` faz de fato é **injetar o ambiente do shell do operador** no processo de produção (incluindo o `TS` exportado, `NODE_OPTIONS` do caminho de baixa RAM, proxies, etc.), e o `pm2 save` seguinte **persiste isso** em `~/.pm2/dump.pm2`. Escolha: **restart sem a flag, a partir de shell limpo.**

**Opção B (padrão — preserva a configuração PM2 de produção):**

```bash
env -i HOME="$HOME" PATH="$PATH" pm2 restart <APPNAME>
pm2 save
pm2 list
```

**Opção A (só se o Passo 0.7 autorizou explicitamente):** nunca `pm2 restart <arquivo-de-ecosystem>` — se o nome do app do arquivo (`atlas-v3-homolog`) não for `<APPNAME>`, isso **sobe um segundo processo** que disputa `<PORT>` (EADDRINUSE, loop de restart) enquanto o antigo continua servindo o build **antigo** — e o `pm2 list` mostra algo `online`, dando falsa aprovação. Sequência correta, que garante processo único:

```bash
pm2 delete <APPNAME>
cd <APPDIR> && env -i HOME="$HOME" PATH="$PATH" pm2 start ecosystem.config.cjs
pm2 save
pm2 list
```

## 6.4 — Provar que **um** processo detém a porta e que ele carregou o build **novo**

⚠️ **Correção da v1:** a v1 aceitava `pm2 list` mostrando `online` + `/api/health` 200 como prova. Nenhum dos dois prova que quem detém `<PORT>` é o processo que você reiniciou, nem que ele carregou o build novo.

```bash
sleep 10
NEW=$(cat <APPDIR>/.next/BUILD_ID); echo "esperado=$NEW"
pm2 pid <APPNAME>
sudo ss -lntp | grep ':<PORT>'          # exatamente UM listener, com o PID do pm2
pm2 list                                 # exatamente UMA app Atlas online

curl -s -o /dev/null -w 'health=%{http_code}\n' "http://127.0.0.1:<PORT>/api/health"
curl -s -o /dev/null -w 'build-novo-na-porta=%{http_code}\n' \
  "http://127.0.0.1:<PORT>/_next/static/$NEW/_ssgManifest.js"

pm2 env "$(pm2 id <APPNAME> | tr -d '[]')" | grep -E '^(ATLAS_ENV|ATLAS_DATABASE_ENVIRONMENT|NODE_ENV|NODE_OPTIONS|TS)=' || echo "sem vazamento de variavel do operador (ok)"
pm2 logs <APPNAME> --lines 40 --nostream
```

- **✅ APROVADO:** um único listener com o PID do PM2 · `health=200` · `build-novo-na-porta=200` · `ATLAS_ENV` no valor decidido no Passo 0.7 · **nenhum** `TS=` ou `NODE_OPTIONS=` herdado · logs sem exceção repetida.
- **❌ REPROVADO:** dois listeners, status `errored`, loop de restart, `build-novo-na-porta=404`, ou vazamento de variável do operador → leia `<APPDIR>/logs/atlas-v3-error.log` e vá ao **Rollback**.

---

# FASE 7 — 🔴 Verificação na ORIGEM (o elo que faltava na v1)

**Este é o passo mais importante do runbook depois da prova de origem.** A v1 pulava direto da `/api/health` para o domínio público: se desse 307 lá, o operador não tinha como distinguir cache de borda, build velho, processo errado, diretório errado ou servidor errado — e a Fase 9 da v1 o empurrava para purgar cache em loop.

## 7.1 — Status **exatos** das rotas, medidos no loopback com o Host do domínio

```bash
for p in /privacy /terms /data-deletion /login /forgot-password /reset-password /api/health /api/ready /dashboard /leads /marketing /settings; do
  printf "%-18s " "$p"
  curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' -H 'Host: atlasaios.com.br' "http://127.0.0.1:<PORT>$p"
done
```

**✅ APROVADO — exatamente isto:**

| Rota | Esperado na origem |
|---|---|
| `/privacy`, `/terms`, `/data-deletion` | **200**, sem `redirect_url` |
| `/login`, `/forgot-password`, `/reset-password` | **200** |
| `/api/health` | **200** |
| `/api/ready` | **200** (ver 7.2 se for 503) |
| `/dashboard`, `/leads`, `/marketing`, `/settings` | **307** → `/login?next=…` |

**Leitura do resultado — esta tabela substitui todo o chute da v1:**

| Origem | Borda (Fase 9) | Diagnóstico | Ação |
|---|---|---|---|
| legais = 200 | legais = 200 | deploy correto | siga para a Fase 9 e conclua |
| legais = 200 | legais = 307 | **100% cache/edge** | Fase 10 (purge no hPanel). **Não faça rollback.** |
| legais = 307 | qualquer | build/processo não entrou | **Não toque no CDN.** Confira `BUILD_ID` (6.4), `proxy.ts` e se o `mv` da 6.2 realmente aconteceu |
| protegidas = 200 | qualquer | **vazamento de rota protegida** | **Rollback imediato** |

- **❌ Qualquer desvio da tabela de aprovação → não avance.** Se as legais derem 307 aqui, o objetivo não foi cumprido e nenhuma quantidade de purge de cache vai mudar isso.

## 7.2 — Regra explícita para `/api/ready` = 503

A v1 diagnosticava e não decidia, deixando o operador cansado sem instrução — e o silêncio favorece "seguir mesmo assim", que é deixar produção no ar com o backend de dados inacessível.

- **`/api/ready` = 503 e `/api/health` = 200:** é rede/credencial do Supabase, **não** build. **Não faça rollback automático**, mas **pare o avanço** e teste a conectividade a partir do servidor:
  ```bash
  SUPA=$(sudo awk -F= '/^[[:space:]]*(export[[:space:]]+)?NEXT_PUBLIC_SUPABASE_URL=/{v=substr($0,index($0,"=")+1); gsub(/["\047[:space:]]/,"",v); print v}' <APPDIR>/.env)
  curl -s -o /dev/null -w 'supabase_rest=%{http_code}\n' "$SUPA/rest/v1/"
  ```
  Resolva antes da Fase 9. (O comando acima usa a URL — que **não é segredo** — apenas em memória; não a imprima em log compartilhado.)
- **`/api/health` também falhando:** **Rollback imediato.**

---

# FASE 8 — Smoke do repo (**informativo**, não é gate)

```bash
cd <APPDIR> && sudo -u <APPUSER> -H bash -lc "cd <APPDIR> && ATLAS_SMOKE_BASE_URL=https://atlasaios.com.br npm run smoke:hostinger"
```

⚠️ **Rebaixado de "gate" para "sinal" (R19).** Lido em `scripts/smoke-hostinger-release.mjs`: o critério é
`passed = response.status >= 200 && response.status < 400 && !location.startsWith("http://")`, com `redirect: "manual"`.
Ou seja, **um `/login` respondendo 307 sai como `passed: true`** — o smoke fica verde exatamente no cenário que este deploy existe para corrigir. Ele também exige `^https://` no `ATLAS_SMOKE_BASE_URL`, então **só mede a borda, cache incluído**, e não cobre `/privacy`, `/terms` nem `/data-deletion`.

**O gate real é a Fase 7 (status exatos na origem).** Use o smoke apenas para ler os `status` brutos do JSON e as latências. `passed: true` **não** é aprovação.

---

# FASE 9 — Teste de aceitação público

⚠️ **Correção da v1:** a v1 batia na borda com URLs limpas, sem cache-buster e sem `no-cache`, e **as respostas que ela esperava são precisamente as que o `hcdn` vem cacheando há semanas** (307 nas protegidas, 200 no `/login`). Um vazamento real de rota protegida passaria como APROVADO. Agora **toda** verificação é cache-bustada e comparada com a origem lado a lado.

## 9.1 — As 3 URLs (o objetivo)

Rode **da sua máquina, sem sessão, sem cookie**:

```bash
for p in /privacy /terms /data-deletion; do
  printf "%-16s borda=%s nocache=%s origem=%s\n" "$p" \
    "$(curl -s -o /dev/null -w '%{http_code}' "https://atlasaios.com.br$p?cb=$(date +%s%N)")" \
    "$(curl -s -o /dev/null -w '%{http_code}' -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' "https://atlasaios.com.br$p")" \
    "$(ssh <SSH_DESTINO> "curl -s -o /dev/null -w '%{http_code}' -H 'Host: atlasaios.com.br' http://127.0.0.1:<PORT>$p")"
done
```

**✅ APROVADO:** `borda=200 nocache=200 origem=200` nas três, e nenhum `location`. Confirme a ausência de redirect:

```bash
for p in /privacy /terms /data-deletion; do
  printf "%-16s " "$p"
  curl -s -o /dev/null -D - "https://atlasaios.com.br$p?cb=$(date +%s%N)" \
    | awk 'NR==1{s=$2} tolower($1)=="location:"{l=$2} END{printf "status=%s location=%s\n", s, (l==""?"(nenhum)":l)}'
done
```

**❌ REPROVADO:** qualquer `307` ou `location` diferente de `(nenhum)`. Use a tabela de diagnóstico do Passo 7.1 para decidir entre **Fase 10 (purge)** e **Rollback**.

## 9.2 — Conteúdo real, não casca

⚠️ **Correção da v1:** o critério "mais de ~2000 bytes" aceitava a página errada — `/login` pré-renderizada tem dezenas de KB, e qualquer página de erro do Next passaria. Um 200 servindo o shell errado seria declarado APROVADO e a Meta reprovaria depois. Os títulos abaixo foram **lidos do código** (`app/privacy/page.tsx:6`, `app/terms/page.tsx:6`, `app/data-deletion/page.tsx:6`).

```bash
chk(){ curl -s "https://atlasaios.com.br$1?cb=$(date +%s%N)" | grep -qF "$2" && echo "$1 OK" || echo "$1 FALHOU (nao contem: $2)"; }
chk /privacy       'Política de Privacidade'
chk /terms         'Termos de Uso'
chk /data-deletion 'Exclusão de dados'
```

## 9.3 — Variantes que a Meta pode cadastrar

`publicPages` em `proxy.ts:7-15` é um `Set` com comparação **exata** de `pathname` — qualquer variante fora da lista cai em `isProtected = true`. Se o campo da Meta for preenchido com barra final, o custo de errar são dias de reenvio de App Review.

```bash
for u in '/privacy' '/privacy/' '/terms' '/terms/' '/data-deletion' '/data-deletion/' '/privacy?fbclid=teste'; do
  printf "%-26s %s\n" "$u" "$(curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}' "https://atlasaios.com.br$u")"
done
```

- **Aceitável:** `200` direto, **ou** `308` para a forma sem barra que então dá `200`.
- **Inaceitável:** `307` para `/login`. Nesse caso, **cadastre na Meta obrigatoriamente a forma SEM barra**.

E com o User-Agent do rastreador da Meta (o objetivo real é ele abrir as URLs; o WAF do `hcdn` pode tratar bots de forma diferente de `curl`):

```bash
for p in /privacy /terms /data-deletion; do
  printf "%-16s UA-meta=%s\n" "$p" \
    "$(curl -s -A 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' -o /dev/null -w '%{http_code}' "https://atlasaios.com.br$p?cb=$(date +%s%N)")"
done
```

- **✅ APROVADO:** `200` nas três também com esse UA.

## 9.4 — Regressão: rotas protegidas continuam protegidas (borda **e** origem)

```bash
for p in /dashboard /leads /marketing /settings; do
  printf "%-12s borda=%s origem=%s\n" "$p" \
    "$(curl -s -o /dev/null -w '%{http_code}' -H 'Cache-Control: no-cache' "https://atlasaios.com.br$p?cb=$(date +%s%N)")" \
    "$(ssh <SSH_DESTINO> "curl -s -o /dev/null -w '%{http_code}' -H 'Host: atlasaios.com.br' http://127.0.0.1:<PORT>$p")"
done
```

**✅ APROVADO:** `borda=307` **e** `origem=307` nas quatro.
**❌ REPROVADO:** qualquer `200` (especialmente na origem) → vazamento de rota protegida. **Rollback imediato.**

## 9.5 — Regressão: rotas públicas de autenticação

```bash
for p in /login /forgot-password /reset-password /api/health; do
  printf "%-18s borda=%s origem=%s\n" "$p" \
    "$(curl -s -o /dev/null -w '%{http_code}' -H 'Cache-Control: no-cache' "https://atlasaios.com.br$p?cb=$(date +%s%N)")" \
    "$(ssh <SSH_DESTINO> "curl -s -o /dev/null -w '%{http_code}' -H 'Host: atlasaios.com.br' http://127.0.0.1:<PORT>$p")"
done
```

**✅ APROVADO:** `200/200` nas quatro.

## 9.6 — Login real (obrigatório, manual — não automatizável)

Abra uma **janela anônima**, vá a `https://atlasaios.com.br/login` e **autentique com uma conta real**.

- **✅ APROVADO:** login conclui e o dashboard carrega, sem erro de Supabase no console.
- **❌ REPROVADO:** erro de Supabase, loop de volta para `/login`, ou "Failed to fetch" apontando para `127.0.0.1:54321` → **o bundle saiu com o placeholder** (R1). Nenhum ajuste de variável conserta. **Rollback + rebuild com o `.env` correto.**

> Isto é obrigatório porque a falha de R1 é **invisível** para curl, para o smoke e para o PM2: tudo fica verde e só o usuário real quebra.

## 9.7 — Prova pública de que o build novo está no ar (substitui o teste frágil de CSP)

```bash
NEW=$(ssh <SSH_DESTINO> "cat <APPDIR>/.next/BUILD_ID"); echo "BUILD_ID novo = $NEW"
curl -s -o /dev/null -w 'asset-novo-publico=%{http_code}\n' \
  "https://atlasaios.com.br/_next/static/$NEW/_ssgManifest.js?cb=$(date +%s)"
```

- **✅ APROVADO:** `200`. Essa URL **nunca foi requisitada antes** (o `BUILD_ID` é novo), logo não pode vir de cache — é prova direta de que o build novo está sendo servido publicamente. **Isto resolve o R9 da v1**, que declarava não existir forma de ver a versão no ar.

Sinal secundário (não é critério de aceitação):

```bash
curl -sI "https://atlasaios.com.br/?cb=$(date +%s)" | grep -i content-security-policy
```

- **Esperado depois do deploy:** a CSP completa de `next.config.ts` (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`…).
- **Antes do deploy:** apenas `upgrade-insecure-requests`.
- ⚠️ **Ressalva honesta:** não foi possível provar que o `hcdn` não reescreve/filtra o header CSP. Se a CSP continuar mínima **mas o Passo 9.7 der 200 e as 3 URLs derem 200**, o objetivo está cumprido — a CSP não é o critério.

---

# FASE 10 — Cache do CDN (**só** se a origem já está correta)

⚠️ **Correção da v1:** a Fase de cache vinha **antes** do teste de aceitação e mandava "repetir a Fase 10" que ainda não havia rodado. E o cache-buster sozinho não decide nada: se o `hcdn` ignorar a query string na chave de cache (configuração comum em hospedagem gerenciada), os dois lados dão 307 e o operador é levado a fazer rollback de um deploy **correto**.

**Pré-condição para entrar aqui:** Passo 7.1 mostrou **origem = 200** nas três legais. Se a origem estiver em 307, **não toque no CDN** — o problema é build/processo.

1. Purgue o cache do site no **hPanel** (acesso do dono).
2. Repita **9.1, 9.2, 9.4 e 9.5** — não só o 9.1. Um purge que reintroduza conteúdo errado precisa ser pego pela regressão das rotas protegidas.
3. Se, com origem = 200, a borda continuar em 307 após o purge, é problema de configuração do CDN — **assunto do dono com o suporte da Hostinger**, não do runbook. A produção está correta; o rollback **não** ajudaria.

---

# ROLLBACK

**Acione se:** o `mv` da Fase 6 falhou; o PM2 não sobe ou fica em loop; 6.4 mostrou dois listeners ou build antigo; 7.1 mostrou rota protegida em 200 ou legais em 307; 9.4 reprovou; 9.6 reprovou (placeholder no bundle).

**Não acione se:** origem = 200 e borda = 307 (é cache — Fase 10); ou `/api/ready` = 503 com `/api/health` = 200 (é rede/credencial — Passo 7.2).

## R.0 — Recarregar contexto (sempre, em qualquer shell)

```bash
export TS=$(sudo cat /var/backups/atlas/CURRENT_TS); echo "TS=$TS"
[ -n "$TS" ] || echo "TS VAZIO - PARE"
sudo ls -ld <APPDIR>.old-$TS
sudo ls -l /var/backups/atlas/atlas-app-$TS.tar.gz /var/backups/atlas/dump-$TS.pm2
```

## R.1 — Rollback blue/green — **segundos, sem rede, sem `npm ci`**

Este é o rollback real. O diretório antigo está inteiro, com seu `node_modules`, seu `.next` e seu `.env` — nada foi excluído.

```bash
pm2 stop <APPNAME> \
  && sudo mv <APPDIR> <APPDIR>.falhou-$TS \
  && sudo mv <APPDIR>.old-$TS <APPDIR> \
  && sudo chmod 700 <APPDIR>.falhou-$TS \
  && echo "ROLLBACK: diretorios trocados"
```

Restaure também o **ambiente lógico** do PM2 (R20 — a v1 restaurava o código e deixava a produção em `homologation`):

```bash
pm2 delete <APPNAME>
sudo cp -a /var/backups/atlas/dump-$TS.pm2 ~/.pm2/dump.pm2
pm2 resurrect
sleep 10
pm2 list
pm2 env "$(pm2 id <APPNAME> | tr -d '[]')" | grep -E '^(ATLAS_ENV|ATLAS_DATABASE_ENVIRONMENT)='
```

Verificação:

```bash
OLD=$(sudo cat /var/backups/atlas/BUILD_ID-antes-$TS.txt); echo "esperado=$OLD"
cat <APPDIR>/.next/BUILD_ID                              # tem de bater com $OLD
sudo ss -lntp | grep ':<PORT>'                           # exatamente UM listener
curl -s -o /dev/null -w 'health=%{http_code}\n' "http://127.0.0.1:<PORT>/api/health"
for p in /login /dashboard /privacy /api/health; do
  printf "%-14s origem=%s borda=%s\n" "$p" \
    "$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: atlasaios.com.br' "http://127.0.0.1:<PORT>$p")" \
    "$(curl -s -o /dev/null -w '%{http_code}' "https://atlasaios.com.br$p?cb=$(date +%s%N)")"
done
```

- **✅ Sucesso:** `BUILD_ID` igual ao de antes · `health=200` · `/login` 200 · `/dashboard` 307 · `/privacy` 307 (é o estado conhecido de antes, **não** uma regressão nova) · `ATLAS_ENV` no valor original.

## R.2 — Se o diretório `.old-$TS` estiver danificado ou ausente

Caminho de contingência a partir do tarball da Fase 4.2. **Mais lento e com uma armadilha que a v1 não tratava:** o tar **exclui `node_modules`**.

```bash
pm2 stop <APPNAME>
cd "$(dirname <APPDIR>)" \
  && sudo mv "$(basename <APPDIR>)" "$(basename <APPDIR>).falhou-$TS" \
  && sudo tar -xzf /var/backups/atlas/atlas-app-$TS.tar.gz -C "$(dirname <APPDIR>)"

# 🔴 PASSO QUE A v1 OMITIA — sem isto o PM2 NÃO SOBE:
# o ecosystem aponta script: "node_modules/next/dist/bin/next"
sudo mv "$(dirname <APPDIR>)/$(basename <APPDIR>).falhou-$TS/node_modules" <APPDIR>/node_modules \
  || sudo -u <APPUSER> -H bash -lc "cd <APPDIR> && npm ci --include=dev"   # só se o mv falhar (lento, exige registry)

sudo cp -a /var/backups/atlas/env-$TS.bak <APPDIR>/.env 2>/dev/null || true
sudo chown -R <APPUSER>:<APPUSER> <APPDIR> && sudo chmod 600 <APPDIR>/.env
ls <APPDIR>/node_modules/next/dist/bin/next && echo "binario next presente (ok)"
```

Só então:

```bash
pm2 delete <APPNAME>; sudo cp -a /var/backups/atlas/dump-$TS.pm2 ~/.pm2/dump.pm2; pm2 resurrect
```

Se o `.next` **não** estava no tar (o Passo 4.3 já teria avisado), é preciso rebuildar — e antes disso reconfirmar o Passo 5.4, senão você reproduz o mesmo defeito.

## R.3 — Limpeza pós-rollback

```bash
sudo chmod 700 "$(dirname <APPDIR>)/$(basename <APPDIR>).falhou-$TS"
sudo chmod 600 "$(dirname <APPDIR>)/$(basename <APPDIR>).falhou-$TS/.env" 2>/dev/null
sudo ls -ld "$(dirname <APPDIR>)/$(basename <APPDIR>).falhou-$TS"
```

Mantenha `.falhou-$TS` para análise, **com permissão fechada** — ele é uma cópia integral do app, `.env` incluído. Ver "Depois do deploy" para o expurgo datado.

---

# DEPOIS DO DEPLOY

## Na Meta Developers (o motivo desta operação)

⚠️ **Só execute depois que os Passos 9.1, 9.2 e 9.3 estiverem ✅.** Se o revisor abrir uma URL que ainda redireciona, a revisão é reprovada e o reenvio custa dias.

1. Abrir `https://developers.facebook.com/apps/` → app **ATLAS AI OS**.
2. **Configurações → Básico**, preencher (use a forma **sem barra final**, salvo se o Passo 9.3 provou que a com barra também dá 200):
   - **URL da Política de Privacidade:** `https://atlasaios.com.br/privacy`
   - **Termos de Serviço:** `https://atlasaios.com.br/terms`
   - **URL de exclusão de dados do usuário:** `https://atlasaios.com.br/data-deletion`
     ⚠️ **Confirmar no painel** se a Meta espera aqui uma **URL de instruções** ou um **callback de exclusão** — são campos diferentes; escolha conforme o que a página `/data-deletion` de fato entrega.
3. Salvar e usar o validador do próprio painel, se disponível.
4. Antes de submeter, revalide as 3 URLs em janela anônima **e** com um validador externo que busque a URL de fora (o rastreador da Meta não usa seus cookies).
5. Submeter o App Review.

**Estas ações no painel da Meta são publicação de conteúdo em nome do dono — quem clica em "Salvar" e "Enviar para revisão" é o dono, não o runbook e não o operador.**

## Higiene de segurança

**Imediato (mesma sessão):**

1. Confirmar que o caminho de bootstrap fechou (se o Passo 5.7 foi aplicado):
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://atlasaios.com.br/api/bootstrap/admin
   ```
   Esperado: **401 ou 404**, nunca 200.
2. Apagar o pacote do servidor:
   ```bash
   sudo rm -f /tmp/atlas-v3-hostinger-homologation.zip /tmp/atlas-v3-hostinger-homologation.zip.sha256
   ```

**Em até 7 dias — expurgar as cópias de segredo que esta operação criou** (a v1 citava só uma; são até cinco):

```bash
sudo shred -u /var/backups/atlas/env-$TS.bak \
             /var/backups/atlas/env-novo-antes-purge-$TS.bak \
             /var/backups/atlas/atlas-app-$TS.tar.gz \
             /var/backups/atlas/dump-$TS.pm2 \
             /var/backups/atlas/pm2-describe-antes-$TS.txt 2>/dev/null
sudo rm -rf <APPDIR>.old-$TS <APPDIR>.falhou-$TS
sudo rm -f ~<APPUSER>/atlas-build-$TS.log
```

⚠️ **Não expurgue nada antes de o deploy estar estável por, no mínimo, 48h** — o `.old-$TS` é o rollback rápido.

**Se o Passo 5.7 foi adiado a pedido do dono:** remover `ATLAS_BOOTSTRAP_SECRET`, `ATLAS_TEST_EMAIL` e `ATLAS_TEST_PASSWORD` do `<APPDIR>/.env`, reiniciar (`env -i HOME="$HOME" PATH="$PATH" pm2 restart <APPNAME>`) e repetir a Fase 9.

## Pendências registradas, fora do escopo desta operação

- **Workers/cron:** conferir se existe agendador chamando as rotas de worker com o Bearer de `ATLAS_CRON_SECRET`. Sem ele, reservas expiradas, lembretes, outbox, relatórios Meta e rotinas noturnas **não rodam** e nada acusa — todas respondem 401 em silêncio.
- **`pm2 startup`:** confirmar que o app volta sozinho após reboot (`pm2 startup systemd -u <APPUSER> --hp /home/<APPUSER>` + `pm2 save`). O repo lista isso como passo manual, e o script que deveria fazê-lo aborta antes.
- **`.nvmrc` inexistente:** nada pina a versão do Node no servidor. Criar um `.nvmrc` com `20.x` e incluí-lo no pacote evita a classe inteira de falha "buildei com 20, o PM2 subiu com 18".
- **Correção de fundo do R15:** adicionar `scripts/reset-official-auth-rbac.mjs` à lista de remoção de `scripts/package-hostinger.mjs`.
- **Correção de fundo do gate de pacote:** a regex de conteúdo proibido de `package-hostinger.mjs` e `verify-hostinger-package.mjs` não cobre `.env`, `.env.production` nem `.env.hostinger`. Ampliar para `/^\.env(?:\.|$)/` exceto `.env.example`.
- **Correção de fundo do smoke:** `scripts/smoke-hostinger-release.mjs` deve exigir status **exato** 200 e cobrir `/privacy`, `/terms`, `/data-deletion`.
- **Chaves vazias:** WhatsApp (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`), object storage (`ATLAS_OBJECT_STORAGE_*`), `PERPLEXITY_API_KEY`. Falham só em runtime, sem log.
- **Migrations:** continuam pendentes e continuam sendo assunto separado, com o conflito de método (`db push` × cadeia curada) **não resolvido**. Não misture com este deploy.
- **`ATLAS_ENV=homologation` em domínio de produção:** decidir se é intencional. Enquanto for, o fallback silencioso de organização está ativo.
- **`/robots.txt` e `/sitemap.xml` retornam 404.** Para o objetivo Meta isso é **aceitável** (404 = sem restrição de rastreamento). Publicar um `robots.txt` explícito permitindo as três rotas é melhoria, não bloqueio.

---

# ANEXO A — Lock da quarentena de rotas preso

**Sintoma:** `npm run build` falha imediatamente com `Outra execução Atlas está ativa (PID x). Aguarde antes de iniciar build ou dev.`

**Causa (lida no código):** `scripts/build.mjs` só chama `quarantine.restore()` no bloco `finally`, que **não roda** sob `SIGKILL` (OOM killer) nem com SSH derrubado. O lock é `join(root, ".atlas-route-quarantine.lock")`, com `root = process.cwd()` (`scripts/route-quarantine.mjs:27`).

**Auto-cura:** se o PID dono estiver morto, o próprio script remove o lock e reentra (`route-quarantine.mjs:18-20`). Só é preciso agir quando o PID foi reciclado por outro processo vivo.

⚠️ **PRÉ-REQUISITO (correção da v1):** este anexo **escreve em disco**. Se o alvo for o `<APPDIR>` **vivo**, o backup da Fase 4 precisa existir e ter passado no Passo 4.3:

```bash
sudo ls -l /var/backups/atlas/atlas-app-$TS.tar.gz     # obrigatório antes de continuar
```

Se o alvo for o `$NEWDIR` (caso normal no blue/green), não há pré-requisito — o diretório é descartável.

Defina o alvo e trabalhe só nele:

```bash
export QROOT=<$NEWDIR ou <APPDIR>, escolha explicitamente>
cd "$QROOT"
```

## Diagnóstico

```bash
ls -la "$QROOT/.atlas-route-quarantine.lock"
cat "$QROOT/.atlas-route-quarantine.lock"          # imprime o PID dono
ps -p "$(cat "$QROOT/.atlas-route-quarantine.lock")" -o pid,cmd
```

- `ps` mostra um `node … next build` **legítimo e em andamento** → **aguarde**, não remova nada.
- `ps` não retorna nada, ou retorna processo sem relação → lock órfão.

## Recuperação — com guarda contra `cp -a /. .`

⚠️ **Correção da v1 — este era o segundo defeito crítico de segurança do runbook.** A v1 fazia:

```
QDIR=$(ls -d .atlas-route-quarantine-build-* | head -1)
cp -a "$QDIR"/. .
rm -rf "$QDIR"
```

Se o glob não casasse — **cenário que a própria v1 declarava provável** ("sobra apenas o arquivo de lock") — `$QDIR` ficava **vazio** e `cp -a "$QDIR"/. .` expandia para **`cp -a /. .`**: cópia recursiva da raiz do sistema (`/etc`, `/root`, `/home`, `/var`) para dentro do diretório servido pela web. Enche o disco, quebra o app e despeja `/etc/shadow` e chaves SSH dentro da árvore da aplicação. O `rm -rf "$QDIR"` seguinte viraria `rm -rf ""`.

Versão corrigida — com guarda, restauração **não destrutiva** e preservação da evidência:

```bash
cd "$QROOT"
rm -f .atlas-route-quarantine.lock

QDIR=$(ls -d .atlas-route-quarantine-build-* 2>/dev/null | head -1)
if [ -z "$QDIR" ] || [ ! -d "$QDIR" ]; then
  echo "Sem diretorio de quarentena — nada a restaurar. Lock removido. PARE AQUI."
else
  find "$QDIR" -mindepth 1 -maxdepth 2 -print
  # -k NAO sobrescreve o que ja existe e denuncia colisao (a v1 usava cp -a, que mesclava em silencio)
  tar -C "$QDIR" -cf - . | tar -C . -xkf -
  # NAO apague: preserve a evidencia ate o build passar
  sudo mv -- "$QDIR" /var/backups/atlas/quarentena-$TS
  echo "quarentena preservada em /var/backups/atlas/quarentena-$TS"
fi
ls -d .atlas-route-quarantine* 2>/dev/null || echo "sem residuo de quarentena (ok)"
```

- **Sucesso:** nenhum `.atlas-route-quarantine*` restante e a árvore de `app/` íntegra.
- Só apague `/var/backups/atlas/quarentena-$TS` **depois** de o build passar e a Fase 9 aprovar.

> ℹ️ A partir **deste ZIP** o cenário é improvável: as 20 rotas legadas (`scripts/legacy-route-paths.mjs`) foram removidas do pacote, então `createRouteQuarantine` não move nada (`movedCount = 0`) — sobra apenas o arquivo de lock, que é criado de qualquer forma, antes de tudo. O procedimento acima cobre o caso de um `<APPDIR>` populado por `git clone`.

⚠️ **Nunca** rode `git add -A` / `git commit` num diretório com quarentena pendente: as rotas apareceriam como **deletadas** e o commit seria destrutivo.

---

# ANEXO B — Caminho alternativo: deploy **in-place** (só se faltar disco para blue/green)

Use **apenas** se o Passo 0.4 mostrou entre 3 e 5 GB livres. Tem mais downtime e um rollback pior. Diferenças em relação ao corpo principal:

1. **Pare o serviço ANTES do `npm ci`** — não durante:
   ```bash
   pm2 stop <APPNAME>
   ```
   Isto é inegociável. `npm ci` apaga o `node_modules` inteiro antes de reinstalar; com o processo vivo, o Next perde os chunks que resolve sob demanda (usuários passam a receber 500), e, com `autorestart: true` + `max_memory_restart: "1G"` no ecosystem, um restart durante o build encontra `node_modules/next/dist/bin/next` **inexistente** → `errored` loop → produção **hard down** até o build terminar, com o operador olhando o log do build sem perceber.
2. **Preserve o `ecosystem.config.cjs` e o `.env` antes do `unzip -o`:**
   ```bash
   sudo cp -a <APPDIR>/ecosystem.config.cjs /var/backups/atlas/ecosystem-prod-$TS.cjs
   sudo sha256sum <APPDIR>/.env | cut -d' ' -f1 | sudo tee /var/backups/atlas/env-hash-antes-$TS >/dev/null
   ```
   Extraia **excluindo** o ecosystem se a decisão do Passo 0.7 for a Opção B:
   ```bash
   sudo -u <APPUSER> -H unzip -o /tmp/atlas-v3-hostinger-homologation.zip -d <APPDIR> -x ecosystem.config.cjs
   sudo sha256sum <APPDIR>/.env | cut -d' ' -f1     # tem de bater com env-hash-antes-$TS
   ```
3. **Faça a checagem de resíduo que o blue/green dispensa (R3):** `unzip -o` sobrescreve mas **não remove** arquivos de releases anteriores, e o build novo **compila** o que sobrou — uma rota órfã pública continuaria no ar, e a Fase 9 só olha URLs conhecidas.
   ```bash
   cd <APPDIR>
   awk '{print $2}' RELEASE_FILES.sha256 | sort > /tmp/pkg-files-$TS.txt
   find app components lib utils types proxy.ts -type f 2>/dev/null | sed 's|^\./||' | sort > /tmp/disk-files-$TS.txt
   comm -13 /tmp/pkg-files-$TS.txt /tmp/disk-files-$TS.txt | tee /tmp/residuo-$TS.txt
   wc -l < /tmp/residuo-$TS.txt
   ```
   Tudo listado **não pertence a esta release**. Qualquer `page.tsx`/`route.ts` ali precisa ser movido para fora de `app/` **antes** do build:
   ```bash
   mkdir -p /tmp/residuo-movido-$TS && rsync -aR --remove-source-files --files-from=/tmp/residuo-$TS.txt . /tmp/residuo-movido-$TS/
   ```
4. **Rollback:** use **R.2**, com o passo de `mv` do `node_modules` — que é obrigatório, não condicional.
5. Todo o resto (Passos 5.4 a 5.10, Fases 7, 9, 10) vale igual, com `$NEWDIR` = `<APPDIR>`.

---

# ANEXO C — Modelo B: Hostinger Node.js Web App (hPanel)

Entre aqui se o Passo 0.2 mostrou que **não há PM2**. A v1 mandava "parar" sem oferecer caminho, o que significava terminar sem atingir o objetivo por desenho.

⚠️ **Honestidade sobre o que não sabemos:** não temos acesso ao hPanel deste projeto e **não podemos confirmar** a existência ou o nome exato de cada opção. Os passos abaixo seguem `docs/HOSTINGER_DEPLOYMENT.md:27` ("Em Node.js Web Apps, configure o comando de inicialização como `npm start`") e o padrão do painel. **Cada item marcado "confirmar no painel" precisa ser verificado pelo dono antes da execução.**

## B.0 — Reconhecimento (read-only)

1. hPanel → Hospedagem → Avançado → **Node.js**. Anotar (confirmar no painel): **Application root**, **Application URL**, **versão do Node**, **Startup file / comando de inicialização**, **porta** exposta.
2. Confirmar que o Application root anotado é o que serve `atlasaios.com.br`: se houver Terminal/SSH no painel, aplique a **prova de origem** do Passo 0.3 (o mecanismo do `BUILD_ID` funciona igual). Se não houver terminal, este é um **bloqueio** — sem prova de origem, o deploy é um chute.

## B.1 — Backup (obrigatório e diferente)

**Não existe `pm2 stop`, não existe `tar` por SSH garantido.** Baixe o **Application root inteiro** pelo Gerenciador de Arquivos **antes de extrair qualquer coisa**. Sem isso **não há rollback** neste modelo. Baixe também o `.env` separadamente e guarde em local seguro (não em pasta compartilhada).

## B.2 — Deploy

1. Upload do ZIP pelo Gerenciador de Arquivos para o Application root.
2. Extrair pelo próprio gerenciador. ⚠️ Equivale a `unzip -o`: **também não remove arquivos antigos** → aplique a checagem de resíduo do **Anexo B, item 3**, se houver terminal.
3. Confirmar que o `.env` do painel/root sobreviveu à extração e que as `NEXT_PUBLIC_SUPABASE_*` estão preenchidas (Passo 5.4). ⚠️ Neste modelo as variáveis normalmente vivem na **aba de variáveis de ambiente do painel**, não só no arquivo — confirmar no painel qual das duas fontes o app usa.
4. Terminal/SSH do hPanel, dentro do Application root:
   ```
   npm ci --include=dev
   npm run prisma:generate
   npm run build
   ```
5. Aplicar o gate de bundle do **Passo 5.9** (é independente de PM2).
6. Remover os scripts destrutivos do **Passo 5.6**.
7. Comando de inicialização: **`npm start`**. **Não existe `pm2`/`ecosystem` neste modelo** — logo o risco R4 muda de lugar: `ATLAS_ENV` vem da aba de variáveis do painel, e a decisão do Passo 0.7 se aplica **lá**.
8. Botão **Restart Application**.

## B.3 — Verificação

Aplique **integralmente** a Fase 7 (origem, via terminal do painel, usando a porta que o painel expõe) e as Fases 9 e 10. Os critérios de aprovação são idênticos.

## B.4 — Rollback

Restaurar o Application root a partir do download do Passo B.1, pelo Gerenciador de Arquivos, e **Restart Application**. ⚠️ É mais lento e mais frágil que o blue/green do modelo A. Se o painel oferecer snapshot/backup automático da hospedagem, **use-o** e confirme a data antes de começar.

---

# ANEXO D — Plano B cirúrgico (se a Fase 1.5 reprovar ou a Fase 9 exigir rollback)

O delta é de **282 commits** desde a versão em produção. Se uma regressão fora das páginas legais inviabilizar esta release, o objetivo Meta ainda pode ser cumprido publicando **só** o commit das páginas legais sobre a base que já está em produção:

```bash
cd /Users/thiagoribasdavila/atlas-v3
# 1) descobrir o commit que está em produção — use o BUILD_ID capturado no Passo 0.3
#    e cruze com os artefatos de release; se não for identificável, PARE: sem base, não há cherry-pick seguro.
git checkout <commit-de-producao> -b hotfix-legal
git cherry-pick 437d3b11
ATLAS_PACKAGE_NAME=atlas-v3-hostinger-legal-only.zip npm run package:hostinger
ATLAS_PACKAGE_NAME=atlas-v3-hostinger-legal-only.zip node scripts/verify-hostinger-package.mjs
```

Isso reduz o deploy às 4 páginas + `proxy.ts`. **Requer descobrir o commit de produção** — o que hoje **não sabemos**; ver "Bloqueios". Não execute este anexo sem essa informação.

---

# ANEXO E — Referência rápida de arquivos citados

| Caminho | Papel |
|---|---|
| `/Users/thiagoribasdavila/atlas-v3/dist/hostinger/atlas-v3-hostinger-homologation.zip` | Artefato a subir |
| `/Users/thiagoribasdavila/atlas-v3/dist/hostinger/atlas-v3-hostinger-homologation.zip.sha256` | Checksum (transferir junto) |
| `/Users/thiagoribasdavila/atlas-v3/proxy.ts` | `publicPages` (linhas 7-15) + `matcher` (linha 38) — origem do 200 nas 3 rotas **e** da prova de origem |
| `/Users/thiagoribasdavila/atlas-v3/utils/supabase/env.ts` | Escape de build que gera o placeholder (risco R1) |
| `/Users/thiagoribasdavila/atlas-v3/next.config.ts` | CSP completa; **sem** `output: "standalone"` |
| `/Users/thiagoribasdavila/atlas-v3/ecosystem.config.cjs` | PM2 — força `ATLAS_ENV=homologation`, `name: atlas-v3-homolog`, `-p 3000`, `autorestart`, `max_memory_restart: 1G` (riscos R4, R20) |
| `/Users/thiagoribasdavila/atlas-v3/scripts/build.mjs` | Build + quarentena (`restore()` em `finally`) |
| `/Users/thiagoribasdavila/atlas-v3/scripts/route-quarantine.mjs` | Lock `.atlas-route-quarantine.lock` em `cwd` (linha 27) |
| `/Users/thiagoribasdavila/atlas-v3/scripts/package-hostinger.mjs` | Empacotador; exclui `logs/` e as 20 rotas legadas; **não** exclui `.env`/`.env.production` da regex de proibidos |
| `/Users/thiagoribasdavila/atlas-v3/scripts/verify-hostinger-package.mjs` | Gate do pacote (exige `ATLAS_PACKAGE_NAME`) |
| `/Users/thiagoribasdavila/atlas-v3/scripts/scan-secrets.mjs` | Único gate que pega `.env` versionado — Passo 1.2 |
| `/Users/thiagoribasdavila/atlas-v3/scripts/check-legal-pages.mjs` | Gate offline das 3 páginas legais (47 casos) |
| `/Users/thiagoribasdavila/atlas-v3/scripts/validate-deploy.mjs` | Gate de deploy — Passo 1.5, **obrigatório** |
| `/Users/thiagoribasdavila/atlas-v3/scripts/smoke-hostinger-release.mjs` | Smoke pós-deploy — **aceita 200–399, é informativo** (R19) |
| `/Users/thiagoribasdavila/atlas-v3/scripts/reset-official-auth-rbac.mjs` | **Destrutivo; embarcado no ZIP; removido no Passo 5.6** (R15) |
| `/Users/thiagoribasdavila/atlas-v3/scripts/bootstrap-admin.mjs` | Idem, removido no Passo 5.6 |
| `/Users/thiagoribasdavila/atlas-v3/app/api/bootstrap/admin/route.ts` | Endpoint de criação de admin, ativo com `ATLAS_ENV ∈ (development, homologation)` + secret ≥ 32 chars (linhas 11-21) |
| `/Users/thiagoribasdavila/atlas-v3/scripts/legacy-route-paths.mjs` | As 20 rotas legadas removidas do pacote |
| `/Users/thiagoribasdavila/atlas-v3/config/environment-variables.json` | Contrato canônico de 96 variáveis |

---

# OBSERVAÇÕES (achados médios/baixos não convertidos em passo)

Itens reais, mas cuja correção não cabe nesta janela ou cujo custo/benefício não justifica bloquear o deploy:

1. **`set -euo pipefail` em todos os blocos.** Um auditor pediu isso. **Não aplicado como escrito**, porque colar `set -e` num shell SSH interativo derruba a sessão na primeira falha — no meio de um deploy, isso é pior do que o problema que resolve. Substituído por encadeamento `&&` nos blocos irreversíveis (4.2, 6.2, R.1, R.2) e `PIPESTATUS` explícito onde o exit code de um pipe importa (5.8). Se você preferir a forma estrita, salve o bloco num arquivo e rode com `bash -euo pipefail arquivo.sh` — **nunca** cole `set -e` na sessão.
2. **Página de manutenção durante a janela.** Com blue/green o downtime cai para segundos, o que torna a página de manutenção pouco relevante. Além disso, ela depende de haver Nginx próprio na frente — **não sabemos se há** (só o Passo 0.3 responde). Deixada como opcional na Fase 3.
3. **Purge do CDN não é automatizável a partir do runbook.** Depende do hPanel, que é acesso do dono. Não há segunda opinião automatizada; a Fase 7 elimina a *necessidade* de adivinhar, mas não o passo manual.
4. **`x-hcdn-cache-status` como sinal.** Útil, mas não confiável como critério — não sabemos se o `hcdn` o emite consistentemente para conteúdo dinâmico. Fica como leitura auxiliar, nunca como gate.
5. **`/robots.txt` e `/sitemap.xml` em 404.** Para o objetivo Meta é aceitável (404 = sem restrição de rastreamento). Publicar um `robots.txt` explícito é melhoria futura.
6. **Aliases `auth:official:reset` e `bootstrap:admin` permanecem no `package.json`** do servidor após o Passo 5.6 — falharão por arquivo inexistente, que é o modo de falha desejado. Removê-los do `package.json` in loco criaria divergência com o inventário `RELEASE_FILES.sha256`; a correção certa é no empacotador.
7. **Comparação de `.env` entre `<APPDIR>` e `$NEWDIR` por hash** prova identidade, não correção. Se o `.env` de produção já estivesse errado, o hash idêntico não denuncia nada — por isso o Passo 5.4 também audita comprimento por chave.
8. **Não há verificação de que o `<APPUSER>` do diretório é o mesmo do processo em todos os cenários** (containers, `systemd` com `User=`). O Passo 0.2 checa os dois e manda parar se divergirem, mas não cobre setups exóticos.
9. **Tempo de boot do Next após a troca** não é conhecido para este servidor. O `sleep 10` do Passo 6.4 é uma estimativa; se o health der `000`, espere mais e repita antes de concluir que falhou.
10. **O smoke da Fase 8 permanece no runbook** apesar de não ser confiável, porque suas latências são úteis e porque removê-lo criaria divergência com a documentação do repo. Está explicitamente rotulado como informativo.

---

## Fluxo resumido (cole na parede)

```
0 reconhecimento (read-only, BLOQUEANTE)
  └─ 0.3 PROVA DE ORIGEM  ── falhou? PARE, servidor errado
  └─ sem PM2? ── Anexo C (modelo B hPanel)
1 gates locais (1.2 e 1.5 OBRIGATÓRIOS)
2 transferir ZIP + checksum, conferir no destino
3 janela + HORA DE CORTE por escrito
4 backup blindado (700/600) + validado de verdade + dump.pm2
5 montar release NOVA ao lado ── tudo reversível de graça aqui
  └─ 5.9 gate de bundle ── falhou? apague $NEWDIR, producao intacta
  ✋ PONTO DE NÃO RETORNO
6 pm2 stop → mv → mv → restart SEM --update-env → provar 1 listener + BUILD_ID novo
7 STATUS EXATOS NA ORIGEM ── legais 200? protegidas 307?  ← o gate real
8 smoke (informativo, ignora 3xx)
9 aceitação pública, cache-bustada, origem x borda lado a lado + login manual
10 purge do CDN — SÓ se origem=200 e borda=307
ROLLBACK = mv de volta + pm2 resurrect do dump   (segundos, sem rede)
```
