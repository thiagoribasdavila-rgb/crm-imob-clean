# Credenciais e custo — o que está ligado, o que falta, o que custa

Medido em **27/07/2026** contra o ambiente real, com chamadas controladas no
backend. Nenhum valor de credencial aparece aqui — só presença e resultado do
teste.

Para conferir de novo a qualquer momento:

```bash
npm run meta:conta
```

---

## 1. O que já responde de verdade

Testado por chamada real, não por "a variável está preenchida".

| Serviço | Estado | Prova |
|---|---|---|
| **Supabase** (banco, auth) | ✅ ligado | 217 leads lidos |
| **Meta Ads** (campanhas) | ✅ ligado | 4 contas alcançáveis, campanha criada e apagada |
| **Meta Lead Ads** (formulários) | ✅ ligado | formulário `Spin Mood (v6)` ACTIVE |
| **Meta Pages** | ✅ ligado | página `DA'Vila Consultoria` |
| **OpenAI** | ✅ ligado | HTTP 200 |
| **Anthropic** | ✅ ligado | HTTP 200 |
| **Perplexity** | ✅ ligado | autenticação aceita |

**Permissões do token Meta** (todas concedidas, token SYSTEM_USER permanente):
`ads_management`, `ads_read`, `leads_retrieval`, `pages_show_list`,
`pages_manage_ads`, `business_management`, `whatsapp_business_messaging`.

> Durante muito tempo o diagnóstico foi "falta `ads_management`". Nunca faltou.
> O bloqueio era o `META_AD_ACCOUNT_ID` apontando para uma conta que o token não
> alcança — e a Meta responde a isso com uma mensagem que fala de permissão.

### Uma correção pendente no ambiente

`META_AD_ACCOUNT_ID` ainda aponta para uma conta fora do alcance do token. Não
impede a operação (a conta agora é escolhida por campanha na tela), mas o padrão
está errado. Troque por uma destas quatro:

```
act_361228100026710   Conta 01 Thiago Davila
act_545585007820378   Conta 02 - Thiago D'avila
act_1004305871494493  CA - Livre Alto da Boa Vista (Thiago)
act_2169318190556460  Inside - Senna
```

---

## 2. O que falta ativar

### 2.1 Bloqueia funcionalidade que já está pronta

| Variável | Para que serve | Onde conseguir |
|---|---|---|
| `ATLAS_WHATSAPP_BRIDGE_SECRET` | Liga a ponte de WhatsApp do corretor | `openssl rand -hex 32` |
| `ATLAS_WHATSAPP_SESSION_DIR` | Onde ficam as credenciais de sessão | Caminho no servidor, **fora do repositório** (ex.: `/var/lib/atlas/whatsapp`, `chmod 700`) |
| `ATLAS_CRM_URL` | Como a ponte alcança o CRM | `http://127.0.0.1:3000` |
| `RESEND_API_KEY` | E-mail transacional (relatório semanal do incorporador) | resend.com |

Sem as três primeiras, a tela do corretor mostra "ponte não configurada" e
**nenhum corretor recebe lead nova** — a regra exige WhatsApp conectado.

A ponte também precisa da biblioteca instalada no servidor:

```bash
npm install @whiskeysockets/baileys qrcode
```

### 2.2 Opcional — funcionalidade que não existe ainda

Estas estão vazias porque a integração correspondente não foi construída.
Deixá-las vazias não quebra nada:

`GOOGLE_CALENDAR_*`, `MICROSOFT_CALENDAR_*`, `GOOGLE_ADS_DEVELOPER_TOKEN`,
`TIKTOK_ADS_ACCESS_TOKEN`, `TELEGRAM_BOT_TOKEN`, `DEEPSEEK_API_KEY`,
`GLM_API_KEY`, `KIMI_API_KEY`, `QWEN_API_KEY`, `ATLAS_OBJECT_STORAGE_*`.

### 2.3 Ajustes, não credenciais

As demais variáveis vazias são parâmetros com padrão embutido no código
(`ATLAS_SLA_*`, `ATLAS_MARKETING_TARGET_CPL`, `ATLAS_IDENTITY_CACHE_TTL_MS`,
etc.). Preencher só se quiser mudar o padrão.

### 2.4 Falso alarme conferido

`NEXT_PUBLIC_SUPABASE_ANON_KEY` aparece vazia, mas o Supabase migrou para
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, que **está** preenchida — e o código lê
a nova com recuo para a antiga (`lib/security/api-auth.ts:32`). Não é problema.

---

## 3. Custo

> **Os preços mudam.** O que está abaixo é o **modelo de cobrança** — o que faz
> a conta subir — e não uma tabela de preços. Confirme os valores atuais em cada
> painel antes de fechar orçamento.

### 3.1 Custo fixo de infraestrutura

| Item | Como cobra | Situação hoje |
|---|---|---|
| **Hostinger VPS** | Mensal fixo por plano | Já contratado |
| **Supabase** | Plano gratuito até limites de banco/banda; Pro por projeto/mês | O banco tem 23 tabelas e 217 leads — bem dentro do gratuito. O Pro passa a valer quando houver backup point-in-time ou mais banda |
| **Domínio** | Anual | Já contratado (`atlasaios.com.br`) |
| **Resend** | Faixa gratuita mensal de e-mails; depois por volume | O uso previsto é 1 relatório por incorporador por semana — volume baixo |

### 3.2 Custo variável — o que realmente pesa

**Verba de anúncio (Meta).** É o maior item, e é você quem define. O CRM não
move verba sozinho: campanha nasce PAUSED e ativar exige alçada de diretoria.

O próprio sistema calcula se a verba sustenta a estrutura. Medido com o motor
real (`recommendAdSetSizing`), ao CPL de R$ 45:

| Verba semanal | Conversões/semana | Sai do aprendizado? |
|---|---|---|
| R$ 300 | ~7 | Não |
| R$ 1.400 | ~31 | Não |
| R$ 2.250 | ~50 | **Sim** (piso: 50 × CPL) |

> Abaixo de ~50 conversões/semana por conjunto, a Meta não consegue otimizar.
> Verba abaixo disso não compra menos resultado — compra resultado sem
> aprendizado, que é pior por real gasto. A tela avisa antes de criar.

**IA (OpenAI / Anthropic / Perplexity).** Cobrança por token consumido. Os usos
no CRM são curtos e pontuais: gerar copy de anúncio, resumir uma lead, sugerir
próxima ação. Não há processamento em massa nem chamada por lead automática.
Ordem de grandeza esperada: baixa perto da verba de anúncio.

Para não depender de estimativa, o projeto tem `ATLAS_AI_PRICE_TABLE` — preencha
com os preços do seu contrato e o custo passa a ser medido, não estimado.

**WhatsApp por QR.** Custo zero de plataforma: é o WhatsApp pessoal do corretor,
não a API paga da Meta. O custo aqui não é financeiro — é o **risco de bloqueio
do número**, assumido conscientemente e registrado em
`lib/whatsapp/bridge-contract.ts`.

### 3.3 O que ainda não custa nada e vai custar

Nada foi ativado que gere cobrança nova. Quando ativar:

1. **Resend** — sai do gratuito se o volume de e-mail crescer
2. **Supabase Pro** — quando quiser backup point-in-time (recomendado antes de
   produção com dados reais de cliente)
3. **Verba de anúncio** — no dia em que a primeira campanha for ativada

---

## 4. Ordem sugerida para ligar

1. Corrigir `META_AD_ACCOUNT_ID` → `npm run meta:conta` fica verde
2. Instalar a biblioteca do WhatsApp e configurar as 3 variáveis da ponte
3. Subir a ponte: `pm2 start ecosystem.config.cjs --only atlas-whatsapp-bridge`
4. Um corretor conecta pela tela (Perfil › Meu WhatsApp) e confere que aparece
   "Conectado"
5. Só então ativar a primeira campanha — com um corretor já pronto para atender

O passo 4 antes do 5 não é detalhe: **a regra nova barra do rodízio quem não
tem WhatsApp conectado**. Ativar campanha antes disso faz as leads empilharem no
gerente.
