# Checklist das keys da Meta — o que preencher no `.env.local`

> Teste a qualquer momento: **`npm run meta:selftest`** (valida tudo na Graph API, sem expor valor).
> Diagnóstico atual (2026-07-20): tokens de Ads/Leads **expirados** (mesmo token curto), WhatsApp **vazio**, CAPI **sem dataset id**, `META_APP_ID` ausente.

## A regra de ouro
Token do **Graph API Explorer dura ~1–2h e expira** (foi o que aconteceu — `code 190 · subcode 463`).
Use **Token de Usuário do Sistema** (Business Manager → Configurações → **Usuários do sistema** → Gerar token). Esse **não expira**.

## Variáveis e onde pegar cada uma

| Variável | O que é | Onde pegar | Escopos |
|---|---|---|---|
| `META_APP_ID` | ID do app | Meta for Developers → seu app → Configurações | — |
| `META_APP_SECRET` | segredo do app ✅ (já tem) | idem | — |
| `META_GRAPH_API_VERSION` | versão ✅ (`v23.0`) | fixo | — |
| `META_AD_ACCOUNT_ID` | conta de anúncios ✅ (já tem) | Gerenciador de Anúncios (formato `act_...`) | — |
| `META_ADS_ACCESS_TOKEN` | ⚠️ **regerar** | Usuário do Sistema → Gerar token | `ads_read` (ou `ads_management` p/ criar campanha) |
| `META_LEAD_ACCESS_TOKEN` | ⚠️ **regerar** (token da **Página**) | Usuário do Sistema → atribuir a Página → Gerar token | `leads_retrieval` + `pages_manage_metadata` + `pages_read_engagement` |
| `META_CONVERSIONS_ACCESS_TOKEN` | CAPI ✅ (setado) | Gerenciador de Eventos → seu dataset → Conjunto de dados → Gerar token | — |
| `META_CAPI_DATASET_ID` | ⚠️ **falta** | Gerenciador de Eventos → seu pixel/dataset → ID | — |
| `META_WEBHOOK_VERIFY_TOKEN` | string que você inventa ✅ | você define (e repete no painel do webhook) | — |
| `WHATSAPP_PHONE_NUMBER_ID` | ⚠️ **vazio** | WhatsApp Manager → API config → **Phone number ID** | — |
| `WHATSAPP_ACCESS_TOKEN` | ⚠️ **vazio** | Usuário do Sistema (WABA) → Gerar token | `whatsapp_business_messaging` + `whatsapp_business_management` |

## Passo a passo
1. **Business Manager → Configurações do negócio → Usuários do sistema** → criar (ou usar) um usuário do sistema **Administrador**.
2. **Adicionar ativos** ao usuário: a **conta de anúncios**, a **Página** e a **conta do WhatsApp (WABA)** — com controle total.
3. **Gerar token** (escolhendo o app e os escopos da tabela). Gere **um token por finalidade** (ads / leads-página / whatsapp) — não reuse o mesmo.
4. Preencher no `.env.local` (cada valor na sua variável). Preencher também `META_APP_ID`, `META_CAPI_DATASET_ID`, `WHATSAPP_PHONE_NUMBER_ID`.
5. Rodar **`npm run meta:selftest`** → tem que dar **4/4 ok**.
6. Me avisar "testar" que eu revalido e sigo (webhook de leads, CAPI de teste, envio WhatsApp de teste com template aprovado).

> Tokens de Usuário do Sistema não expiram — resolve o `code 190` de vez. Guarde-os com cuidado (o `.env.local` é gitignored e nunca vai para o repo/ZIP).
