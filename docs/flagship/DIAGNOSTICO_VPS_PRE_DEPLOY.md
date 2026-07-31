# DIAGNÓSTICO DA INFRAESTRUTURA REAL

**2026-07-31T15:08:16Z** · somente leitura, do lado de fora. Nada foi alterado.

# CONCLUSÃO EM UMA LINHA

> **Hostinger, com CDN na frente. A origem está escondida atrás do edge e
> continua não identificada** — e o repositório documenta **dois modelos
> mutuamente exclusivos** para ela.

## 1. O PROVEDOR: HOSTINGER, POR QUATRO SINAIS INDEPENDENTES

| sinal | evidência |
|---|---|
| nameservers | `orbit.dns-parking.com` · `horizon.dns-parking.com` |
| e-mail | MX `mx1/mx2.hostinger.com` · SPF `_spf.mail.hostinger.com` |
| CDN | `www` → **`www.atlasaios.com.br.cdn.hstgr.net`** |
| cabeçalhos | `server: hcdn` · `x-hcdn-cache-status: HIT` · `x-hcdn-request-id: …-asc-edge7` |

## 2. OS IPs DO DOMÍNIO SÃO DO EDGE, E MUDAM

| medição | A records |
|---|---|
| primeira | 89.116.213.33 · 91.108.127.185 |
| segunda | **91.108.127.17 · 77.37.42.116** |

Os IPs **rotacionam entre medições**: são bordas de CDN com balanceamento, não o
servidor de origem. Nenhum aceita SSH.

O próprio `docs/deploy/RUNBOOK_DEPLOY_HOSTINGER.md` já registrava isto em 21/07:
*"edge da Hostinger — **não é o IP do servidor de origem**"*.

## 3. O VPS `85.209.93.32` NÃO SERVE O DOMÍNIO

```
curl -H "Host: atlasaios.com.br" http://85.209.93.32/   → 000 (nada escuta)
```

Contra os edges, o mesmo comando devolve 301. **O VPS diagnosticado não é a
origem** — publicar nele não mudaria o que o domínio serve.

## 4. O REPOSITÓRIO NÃO DECIDE — e já sabia disso

`RUNBOOK_DEPLOY_HOSTINGER.md`, seção "⛔ Bloqueio zero":

> *"Não sabemos onde o processo de produção roda. O domínio está atrás do CDN da
> Hostinger, que esconde a origem. O repositório documenta dois modelos
> mutuamente exclusivos, ambos com documentação viva:*
> *(A) VPS Ubuntu com Nginx + PM2, app em `/var/www/atlas`;*
> *(B) Hostinger Node.js Web App gerenciada pelo hPanel."*
>
> *"Os headers medidos são compatíveis com **os dois**. **Não dá para decidir
> daqui.**"*

**Sem CI/CD.** Os dois workflows (`atlas-release-gate`, `atlas-security`) são
portões de qualidade, não deploy. Sem `vercel.json`, sem `Dockerfile`, sem
`Procfile`. **Nada no repositório publica sozinho** — o deploy é manual.

## 5. O QUE O BUNDLE NO AR PROVA SOBRE O INCIDENTE

Baixei os **8 chunks** que `/login` carrega e procurei o endereço do Supabase:

```
✘ NENHUM chunk carrega URL do Supabase
```

**O build de produção rodou inteiramente sem ambiente.** Não é só a variável do
servidor que falta — o JavaScript entregue ao navegador **não tem para onde
autenticar**. É a explicação completa de `/login` responder 200 sem campo de
senha.

Também não há `127.0.0.1:54321` nos chunks: o build no ar é anterior ao
placeholder ou usou outro caminho. De todo modo, **está sem configuração**.

## 6. O `BUILD_ID` NÃO É EXTRAÍVEL DE FORA

A prova de origem do runbook (Passo 0.3) usa
`/_next/static/<BUILD_ID>/_ssgManifest.js`. O HTML servido **não expõe o
BUILD_ID** — provavelmente porque a página vem do cache do CDN em forma
pré-renderizada. **A prova de origem só funciona de dentro do servidor.**

# O QUE FALTA — e só o dono tem

Três perguntas. **A primeira sozinha desbloqueia tudo:**

| # | pergunta | onde se responde |
|---|---|---|
| 1 | **A aplicação roda num VPS ou num "Node.js App" gerenciado?** | hPanel → o serviço vinculado a `atlasaios.com.br` |
| 2 | Se VPS: **qual IP/hostname e qual usuário SSH?** | hPanel → VPS |
| 3 | Se app gerenciada: **qual o diretório e onde ficam as variáveis?** | hPanel → Node.js App |

**Não peça senha por chat.** Para SSH, o caminho seguro é adicionar uma chave
pública ao servidor; para o hPanel, o próprio painel.

# O QUE JÁ ESTÁ PRONTO PARA CADA CENÁRIO

| cenário | caminho |
|---|---|
| **(A) VPS** | `scripts/production/prepare-release.sh` → `deploy-release.sh` → `post-deploy-check.sh` |
| **(B) Node.js App do hPanel** | subir o ZIP pelo painel, cadastrar as variáveis, build `npm run build` — **e o build agora RECUSA se faltar variável** |

Nos dois, o mesmo pacote:
`atlas-one-v3.0.0-rc.2-production-20260731-1150-e4dd7152.zip`
