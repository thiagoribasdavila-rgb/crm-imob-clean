# META → ATLAS CRM · STATUS

**Medido em 03/08/2026** contra a Graph API, o banco de produção
(`pozbrcsfthnhmnebfoxv`) e o endereço público `atlasaios.com.br`.
Nada aqui foi inferido do código — cada número tem uma consulta atrás.

---

## O veredito em uma linha

**A integração está de pé, e as 103 leads que faltavam voltaram.**
O que restava não era permissão da agência nem token: era um ID de Página que o
produto tinha no banco e não usava, e leads históricas que o webhook, por
desenho, nunca reentregaria.

---

## 1 · Os elos, um a um

| elo | estado | evidência |
|---|---|---|
| Página Meta | ✅ `582258611872380` — **DA'Vila Consultoria** | Graph `/{page-id}` devolveu nome e categoria |
| Token de sistema | ✅ alcança 1 Página, deriva token de Página | `me/accounts` → 1 resultado |
| Inscrição `leadgen` | ✅ app **ATLAS AI OS** (`2441435319712424`) | `/{page}/subscribed_apps` |
| Callback | ✅ `https://atlasaios.com.br/api/webhooks/meta` | `/{app}/subscriptions`, campos `leadgen` + `leadgen_update` v25.0 |
| Assinatura HMAC | ✅ POST assinado → `200`; errada → `401` | testado contra a produção |
| Verify token | ⚠️ **diverge** — o do `.env.local` recebe `403` | ver §5 |
| Fontes no CRM | ✅ 29 registradas · **16 ativas** | os 13 formulários com lead estão todos ativos |
| Fila sem destino | ✅ **0** | nenhuma lead chegou e ficou órfã |

---

## 2 · O que estava errado, e por quê

**A represa mostrava ZERO com 103 leads esperando.**

`/api/v1/marketing/held-leads` lia a Página de `process.env.META_PAGE_ID` —
variável que **não existe no ambiente do servidor**. Sem ela, a rota respondia
`200 OK` com `totalRepresado: 0`. Sem erro, sem alerta, sem nada para clicar.

Um zero silencioso é pior que uma falha: erro vermelho alguém conserta, "0 leads
represadas" alguém comemora.

E o ID estava a **uma consulta de distância** — `meta_lead_sources.page_id`, 29
linhas, na mesma tabela que a rota já lia duas linhas abaixo.

Mais dois zeros fabricados no mesmo arquivo:

- a listagem de formulários fazia `data ?? []` e **engolia erro da Graph** —
  token expirado ou cota estourada viravam "represa zero" com `200 OK`;
- a recusa dizia *"TOKEN ou PAGE_ID ausente"*, colapsando duas causas
  independentes numa frase que obrigava a testar as duas hipóteses.

**Prova da correção:** com `META_PAGE_ID=999999999999` (Página inexistente) no
ambiente do servidor, a rota devolveu **103**. O código antigo teria devolvido
zero — a Graph recusa a Página falsa. O banco venceu.

---

## 3 · A recuperação das 103

O silêncio do webhook desde 28/07 era **honesto**: a lead mais nova na Meta é de
**26/07**. Campanha parada não é defeito de integração. As 103 ausentes são
**anteriores à inscrição** — webhook não reentrega o que nunca assinou.

Recuperadas pela esteira existente (backfill → `meta_lead_events` → outbox →
worker), em dois estágios com conferência no meio.

| | |
|---|---:|
| buscadas na Graph | 122 |
| novas enfileiradas | **103** |
| ficaram sem tarefa no outbox | 0 |
| **importadas** | **80** |
| recusadas por duplicidade | 42 |
| falhas reais | 1 |
| **leads novas no CRM** | **51** |
| telefones duplicados | **0** |
| e-mails duplicados | **0** |

As 42 recusas são a regra de contato único do CRM: **a lead já existia** por
outra origem. É a deduplicação pedida, funcionando. A falha real é um payload de
teste de 28/07 cujo `leadgen_id` a Graph diz não existir.

As 80 importadas estão **todas** vinculadas a uma lead, **todas** com telefone,
**todas** com origem Meta. As leads foram gravadas com a data de origem
(23/06 a 26/07), não com a de hoje — o histórico não mente a idade.

> **As 51 novas estão SEM DONO.** Não distribuí: distribuir dispara relógio de
> SLA em cada lead, e com leads de 8 a 41 dias todos nasceriam vencidos. É
> decisão da diretoria, em ondas que a equipe consiga atender.

---

## 4 · O vigia

`GET /api/v1/integrations/meta/saude` — e um painel no topo de **Marketing →
Formulários de lead da Meta**.

O pedido era "alertar quando ficar sem eventos". Construir isso ao pé da letra
teria produzido um alarme **errado**: em 03/08 fazia 6 dias sem evento e a
integração estava perfeita.

O sintoma não é o silêncio — é a **divergência**:

| estado | quando | acende? |
|---|---|:---:|
| `em_dia` | represa 0 | não, mesmo em silêncio de semanas |
| `atrasado` | represa > 0, evento recente | sim |
| `mudo` | represa > 0 e > 24h sem evento | sim |
| `sem_configuracao` | nenhuma fonte ativa | sim, antes de qualquer conta de tempo |
| `nunca_recebeu` | sem evento e sem represa | não — é integração nova |

Responde os cinco itens pedidos: status, último evento, volume (24h/7d/30d),
erros agrupados pela causa, e o alarme.

**Duas datas, dois fatos.** `created_at` responde "a entrada está viva?";
`received_at` responde "qual a lead mais nova?". Confundi as duas na primeira
versão e o painel disse *"136h sem evento"* minutos depois de gravar 103.

**Erros marcados como esperados.** "Contato já existe" aparece como
`esperado: true` — contá-lo como erro da Meta faria a operação caçar um defeito
que não existe. Hoje: **42 esperados, 1 a olhar**.

---

## 5 · O que falta, e de quem é

| pendência | de quem | consequência hoje |
|---|---|---|
| **Verify token diverge** na produção | dono do servidor | reinscrição do webhook falharia; **entrega não é afetada** |
| **Distribuir as 51** leads recuperadas | diretoria | 51 leads pagas no CRM sem corretor |
| **Subir este código** para produção | dono do servidor | produção roda commit anterior — a represa continua mostrando zero lá |
| Payload de teste órfão (1 evento) | — | ruído de 1 linha no painel de erros |

---

## 6 · Verificação

```
tsc 0  ·  lint 0 (--max-warnings=0)  ·  1.946 contratos, 0 falhas  ·  235/235 portões
```

Provas executadas contra o sistema vivo:

- `scripts/prova-represa-nao-mente-zero.mjs` — a rota, autenticada, com usuário
  descartável; confirma 103 e que a Página veio do **cadastro**, não do ambiente
- `scripts/recupera-leads-represadas.mjs` — a recuperação, em dois estágios

**Não verificado:** o painel pintado na tela. A sessão do navegador entra num
laço que limpa o formulário de acesso e não consegui autenticar para vê-lo. O
portão de rotas órfãs confirma que a tela alcança a rota, e a rota devolve o dado
certo — mas *"chega ao componente"* não é *"pinta no lugar certo"*.

---

## 7 · Onde olhar

| o quê | onde |
|---|---|
| saúde da entrada | `app/api/v1/integrations/meta/saude/route.ts` |
| regra do alarme (pura) | `lib/meta/saude-da-entrada.ts` |
| represa | `app/api/v1/marketing/held-leads/route.ts` |
| Página da organização | `lib/meta/pagina-da-organizacao.ts` |
| conta de anúncios ≠ Página | `lib/meta/identificadores.ts` |
| webhook | `app/api/webhooks/meta/route.ts` |
| recuperação | `scripts/recupera-leads-represadas.mjs` |
