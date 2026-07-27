# Credenciais e custos — ATLAS ONE

Levantado em **27/07/2026** contra o ambiente real. Cada linha marcada
`✅ testado` veio de uma chamada que respondeu, não de "a variável está
preenchida". **Nenhum valor de chave aparece neste documento.**

Reconferir a qualquer momento: `npm run meta:conta`

> **Sobre os custos:** as tabelas de preço mudam e não invento número. Onde há
> valor, ele veio de medição do próprio sistema (assinalado) ou do modelo de
> cobrança público do serviço. **Confirme no painel de cada fornecedor antes de
> fechar orçamento.**

---

## Tabela geral

| Serviço | Variável ENV | Finalidade | Obrig. | Onde obter | Ambiente | Custo fixo | Custo por uso | Situação | Ação pendente |
|---|---|---|---|---|---|---|---|---|---|
| **Supabase** (banco) | `NEXT_PUBLIC_SUPABASE_URL` | Endereço do projeto | **Sim** | supabase.com › Project Settings › API | server+client | Free até os limites do plano | — | ✅ testado (217 leads) | — |
| **Supabase** (leitura pública) | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Auth do navegador, sob RLS | **Sim** | mesmo painel | client | incluso | — | ✅ SET | — |
| **Supabase** (admin) | `SUPABASE_SERVICE_ROLE_KEY` | Escrita no servidor, ignora RLS | **Sim** | mesmo painel | **server** | incluso | — | ✅ testado | Nunca expor ao cliente |
| **Banco (Postgres)** | `DATABASE_URL` | Acesso direto/migrations por CLI | Não | Supabase › Database › Connection string | server | incluso no Supabase | — | ⬜ vazia | Só se for usar `psql`/CLI |
| **Meta App** | `META_APP_ID`, `META_APP_SECRET` | Identidade do app na Graph API | **Sim** | developers.facebook.com › App › Settings | server | **grátis** | — | ✅ SET | — |
| **Meta access token** | `META_ADS_ACCESS_TOKEN` | Autentica todas as chamadas | **Sim** | Business Settings › System Users › Generate token | **server** | grátis | — | ✅ testado (SYSTEM_USER, permanente) | — |
| **Meta Ad Account** | `META_AD_ACCOUNT_ID` | Conta **padrão** ao subir campanha | Não¹ | Gerenciador de Anúncios | server | grátis | **verba de anúncio** | ⚠️ **aponta p/ conta fora do alcance** | Trocar por uma das 4 válidas (abaixo) |
| **Meta Page** | `META_PAGE_ID` | Página que veicula o anúncio | **Sim** | facebook.com/<página> › Sobre | server | grátis | — | ✅ testado (`DA'Vila Consultoria`) | — |
| **Meta Lead Form** | `META_LEAD_FORM_ID` | Formulário instantâneo | **Sim** | Gerenciador › Formulários | server | grátis | — | ✅ testado (`Spin Mood (v6)` ACTIVE) | — |
| **Meta Pixel** | `META_PIXEL_ID` | Pixel do site (não é o do CAPI) | Não | Gerenciador de Eventos | server | grátis | — | ⬜ **vazia** | Só se for instrumentar site |
| **Meta CAPI** (dataset) | — *(não é ENV)* | Para onde os eventos vão | Não⁴ | Gerenciador de Eventos › Conjunto de dados | **banco** | grátis | — | ⬜ **não configurado** | Definir em **Integrações › Meta › Conversões** — é por organização, não do ambiente |
| **Meta CAPI** (token) | `META_CONVERSIONS_ACCESS_TOKEN` | Autentica o envio de conversões | Não⁴ | mesmo painel › Gerar token | **server** | grátis | — | ⬜ **vazia** | **Definir** |
| **Meta CAPI** (chave geral) | `ATLAS_META_CAPI_ENABLED` | `true` libera o envio real | Não⁴ | você define | server | grátis | — | ⬜ **vazia** | **`true` só depois das duas acima** |
| **Meta webhook** | `META_WEBHOOK_VERIFY_TOKEN` | Valida o webhook de leads | **Sim** | você inventa; cole igual no painel | server | grátis | — | ✅ SET | — |
| **Meta Instagram** | `META_INSTAGRAM_ACTOR_ID` | Veicular também no Instagram | Não | Business Settings › Contas do Instagram | server | grátis | — | ⬜ vazia | Só se quiser anunciar no IG |
| **OpenAI** | `OPENAI_API_KEY` | Copy de anúncio, resumos | Não² | platform.openai.com › API keys | **server** | sem mensalidade | **por token** | ✅ testado (HTTP 200) | — |
| **Claude (Anthropic)** | `ANTHROPIC_API_KEY` | Mesma função, outro provedor | Não² | console.anthropic.com | **server** | sem mensalidade | **por token** | ✅ testado (HTTP 200) | — |
| **Perplexity** | `PERPLEXITY_API_KEY` | Pesquisa com fonte | Não | perplexity.ai › API | server | sem mensalidade | por token | ✅ testado (auth aceita) | — |
| **WhatsApp Bridge** (segredo) | `ATLAS_WHATSAPP_BRIDGE_SECRET` | Autentica CRM ↔ ponte | **Sim³** | `openssl rand -hex 32` | server | **grátis** | — | ⬜ **vazia** | **Gerar e definir** |
| **WhatsApp Bridge** (sessões) | `ATLAS_WHATSAPP_SESSION_DIR` | Onde ficam as credenciais de sessão | **Sim³** | caminho do servidor, **fora do repo** | server | grátis | — | ⬜ **vazia** | `/var/lib/atlas/whatsapp`, `chmod 700` |
| **WhatsApp Bridge** (CRM) | `ATLAS_CRM_URL` | Como a ponte alcança o CRM | **Sim³** | `http://127.0.0.1:3000` | server | grátis | — | ⬜ **vazia** | **Definir** |
| **WhatsApp Bridge** (porta) | `ATLAS_WHATSAPP_BRIDGE_URL`, `..._PORT` | Onde a ponte escuta | Não | padrão `127.0.0.1:8790` | server | grátis | — | ⬜ usa padrão | — |
| **SMTP / e-mail** | `RESEND_API_KEY` | Relatório semanal do incorporador | Não | resend.com › API Keys | server | faixa gratuita mensal | por e-mail acima da faixa | ⬜ **vazia** | **Criar conta e verificar domínio** |
| **Domínio** | — | `atlasaios.com.br` | **Sim** | registro.br / registrador | — | **anual** | — | ✅ contratado | Apontar DNS para o VPS |
| **Hostinger VPS** | `PORT` | Onde a aplicação roda | **Sim** | painel Hostinger | server | **mensal** | — | ✅ contratado | — |
| **PM2** | — | Mantém app e ponte no ar | **Sim** | `npm i -g pm2` | server | **grátis** (open source) | — | ✅ `ecosystem.config.cjs` | `pm2 startup` + `pm2 save` |

¹ Deixou de ser obrigatória: a conta é escolhida por campanha na tela. O ENV é só o padrão.
² Pelo menos **um** provedor de IA é necessário para gerar copy. Os três juntos são redundância, não exigência.
⁵ O dataset saiu do ambiente e passou a viver em `meta_conversion_configs`, por organização: um `META_CAPI_DATASET_ID` único mandaria a conversão de uma imobiliária para o dataset de outra. Configurar sempre nasce em modo **teste**; ir para produção é um segundo gesto, do diretor — evento de teste não entra no aprendizado do algoritmo.

⁴ Sem CAPI a Meta otimiza para **quem preenche formulário**, não para quem compra. Medido: `meta_conversion_events` tem **0 linhas** — nenhum evento de conversão jamais saiu. É a maior alavanca de eficiência de anúncio ainda desligada.

³ Obrigatórias **se** for usar WhatsApp por corretor. Sem elas a ponte fica desligada e **nenhum corretor recebe lead nova** — a regra exige WhatsApp conectado.

---

## Contas de anúncio válidas

`META_AD_ACCOUNT_ID` aponta hoje para uma conta que o token **não alcança**.
Toda chamada volta com *"(#200) Ad account owner has NOT grant ads_management"* —
mensagem que manda conferir permissão quando o problema é o ID.

As quatro que o token alcança, todas ativas em BRL / America/Sao_Paulo:

```
act_361228100026710   Conta 01 Thiago Davila
act_545585007820378   Conta 02 - Thiago D'avila
act_1004305871494493  CA - Livre Alto da Boa Vista (Thiago)
act_2169318190556460  Inside - Senna
```

## Permissões do token Meta (todas concedidas)

`ads_management` · `ads_read` · `leads_retrieval` · `pages_show_list` ·
`pages_manage_ads` · `business_management` · `whatsapp_business_messaging`

---

## Custo — o que realmente pesa

### Fixo mensal

| Item | Situação |
|---|---|
| Hostinger VPS | já contratado |
| Domínio | já contratado (anual) |
| Supabase | dentro do plano gratuito (23 tabelas, 217 leads). O Pro passa a valer quando quiser backup point-in-time — **recomendado antes de produção com dados de cliente** |
| Resend | faixa gratuita cobre 1 relatório por incorporador por semana |
| PM2, Meta App, WhatsApp por QR | **zero** |

### Variável — verba de anúncio

É o maior item e é você quem define. O CRM **não move verba**: campanha nasce
PAUSED e ativar exige alçada de diretoria.

Medido com o motor real do projeto (`recommendAdSetSizing`), ao CPL de R$ 45:

| Verba semanal | Conversões/semana | Sai do aprendizado? |
|---|---|---|
| R$ 300 | ~7 | Não |
| R$ 1.400 | ~31 | Não |
| **R$ 2.250** | **~50** | **Sim** (piso = 50 × CPL) |

Abaixo de ~50 conversões/semana por conjunto a Meta não otimiza. Verba menor não
compra menos resultado — compra resultado sem aprendizado, pior por real gasto.
A tela avisa antes de criar.

### Variável — IA

Cobrança por token. Os usos são curtos e pontuais (copy de anúncio, resumo de
lead, próxima ação). Não há processamento em massa nem chamada automática por
lead. Ordem de grandeza: baixa perto da verba de anúncio.

Para medir em vez de estimar, preencha `ATLAS_AI_PRICE_TABLE` com os preços do
seu contrato — o custo passa a ser calculado.

### Variável — WhatsApp por QR

**Custo financeiro zero**: é o WhatsApp do corretor, não a API paga da Meta.

O custo aqui é **risco de bloqueio do número**, assumido conscientemente e
registrado em `lib/whatsapp/bridge-contract.ts`.

---

## Ordem para ligar

1. Corrigir `META_AD_ACCOUNT_ID` → `npm run meta:conta` fica verde
2. Gerar `ATLAS_WHATSAPP_BRIDGE_SECRET`, criar `ATLAS_WHATSAPP_SESSION_DIR`
   (`chmod 700`, fora do repo), definir `ATLAS_CRM_URL`
3. `pm2 start ecosystem.config.cjs --only atlas-whatsapp-bridge`
4. Conectar um corretor: pela tela (Perfil › Meu WhatsApp) ou
   `npm run whatsapp:conectar -- <profile_id>`
5. **Só então** ativar a primeira campanha

O passo 4 antes do 5 não é detalhe: a regra barra do rodízio quem está sem
WhatsApp conectado. Campanha ativada antes disso faz lead empilhar no gerente.
