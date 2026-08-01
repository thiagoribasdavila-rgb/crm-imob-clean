# CHECKLIST DE INTEGRAÇÕES

**2026-07-31.** Estado **medido**, não declarado por configuração.

> A régua: **"credencial presente" não é "funciona".** Um estado só é verde
> quando uma chamada real teve sucesso.

| integração | estado | evidência |
|---|---|---|
| **Supabase** | ✅ viva | 482 leads lidas, 4 migrations aplicadas hoje |
| **Meta — Insights** | ✅ viva | R$ 3.612,01 importados de 7 campanhas, 94 dias |
| **Meta — permissões** | ✅ 15 concedidas, 0 negadas | `me/permissions` |
| **Meta — conta de anúncios** | ⚠️ **conta errada** | 7 campanhas, R$ 3.612,01, **0 leads**; as 24 leads vêm de campanha de **outra** conta |
| **Meta — página** | ❌ não compartilhada | `1115087091694606` fora do BM `488439536919148` |
| **Meta — CAPI** | ⚠️ modo `test` | 1 evento na história, com `test_event_code` |
| **Meta — webhook** | ✅ autentica | 200 com segredo real; 401 com placeholder (provado) |
| **WhatsApp** | ⚠️ **não medido** nesta rodada | — |
| **SMTP** | ⚠️ **não medido** nesta rodada | — |
| **Telegram** | ⚠️ opcional | sem ele, a tarefa no CRM continua |
| **Provedores de IA** | ⚠️ 1 de 3 vivo | Perplexity 200; OpenAI 429 `insufficient_quota`; Anthropic 400 "credit balance too low" |

## A INTEGRAÇÃO MAIS CARA ESTÁ QUEBRADA E NÃO PARECE

`act_2169318190556460` gastou **R$ 3.612,01** e trouxe **0 leads**. As 24 leads
atribuídas vêm de `120251113236400624`, que **não pertence** a essa conta — a
Graph API recusa consultá-la com `(#10) Application does not have permission`.

**Existem pelo menos duas contas de anúncio, e a que o CRM lê não é a que produziu
as leads que o CRM tem.** Nenhuma tela acusava isso antes desta rodada, porque
`marketing_spend` estava vazia e todo relatório de custo respondia R$ 0.

## VERIFICADOR

```bash
curl -s https://SEU-DOMINIO/api/v1/ready | head -c 600
```

Cinco estados, sem ambiguidade: `viva` · `quebrada` ·
`configurada_nao_verificada` · `desativada` · `ausente`. **Só `viva` é verde.**
