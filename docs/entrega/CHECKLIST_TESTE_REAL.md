# Checklist de teste real — evidências

Tudo aqui foi executado contra o **banco de homologação real**
(`pozbrcsfthnhmnebfoxv`) com sessão HTTP autenticada, salvo onde indicado.
Nada foi simulado, e o que não pôde ser testado está marcado como tal — não como
aprovado.

## Como reexecutar

```bash
npm run smoke:ciclo
```

Percorre a vida de uma lead de Meta Ads em 23 etapas. **Cria a própria lead e o
próprio corretor, e apaga os dois no fim** — nenhuma lead existente é tocada.

> O alvo é sempre `localhost`. Só `ATLAS_SMOKE_BASE_URL` redireciona, e ele
> avisa quando não é local: a primeira versão deste smoke herdou `ATLAS_BASE_URL`
> do `.env.local` e testou **o build em produção** sem ninguém pedir.

---

## Ciclo operacional — 23/23

| # | etapa | resultado |
|---|---|---|
| 1 | lead de `meta_ads` nasce com prazo de 5 min | ✅ |
| 2 | vigia de SLA responde 200 e cria a tarefa de cobrança | ✅ 1 tarefa |
| 3 | a lead aparece na fila ordenada por SLA | ✅ posição 10 de 10 |
| 4 | a ficha expõe o prazo; `contatadoEm` nulo antes do clique | ✅ |
| 5 | um clique registra o contato (201) | ✅ |
| 6 | o relógio de primeiro contato **fecha** | ✅ 10 min medidos |
| 7 | atraso reconhecido — 10 min não é "dentro de 5 min" | ✅ `false` |
| 8 | evento na linha do tempo com marca de primeiro contato | ✅ |
| 9 | o pipeline conta a lead contatada | ✅ saiu do zero |
| 10 | recontato não se declara primeiro contato | ✅ |
| 11 | a medição original permanece intacta | ✅ |
| 12 | lead e corretor de teste removidos | ✅ |

## Autenticação e provisionamento — 12/12

| verificação | resultado |
|---|---|
| magiclink devolve sessão utilizável | ✅ |
| **recuperação de senha chega ao fim** | ✅ |
| organização de corretor real intacta após update de metadado | ✅ |
| papel e ativação intactos | ✅ |
| cadeia de supervisão intacta | ✅ |
| usuário novo nasce na organização operacional | ✅ |
| usuário novo nasce **inativo** | ✅ |
| nenhuma falha de provisionamento pendente | ✅ |

## SLA de follow-up — 8/8

Ciclo aberto pelo gatilho, **fechado** pelo registro de contato (`recovered`),
tempo medido e atraso reconhecido (`on_time: false`).

## Ingestão da Meta ponta a ponta — real

| verificação | resultado |
|---|---|
| 26 formulários descobertos, 119 leads acumuladas | ✅ |
| fonte órfã detectada (id inexistente na Meta) | ✅ 1 |
| simulação não grava nada | ✅ banco intacto |
| backfill de 1 formulário → 3 leads reais no CRM | ✅ |
| reprocessamento **não duplica** | ✅ 217 antes e depois |
| `platform` (fb/ig) e `is_organic` capturados | ✅ |
| campanha/conjunto/anúncio | ⚠️ ausentes — exige `ads_read` |
| leads entram **sem responsável** | ⚠️ falta regra de distribuição |

## Fila de represadas — real

**116 leads represadas em 12 formulários.** O formulário cujas 3 leads já foram
ingeridas **não aparece** — a conta zerou, que é o teste mais honesto de que o
número mede o que promete. `POST` sem lista responde **400**: não existe
"liberar tudo".

## Stop loss de verba — real

Veredito **PARAR**, com a conta de anúncios ainda bloqueada:
> Só 0% das leads pagas foram contatadas. Comprar mais é desperdício integral.

E declara o que **não** avaliou: gasto desconhecido, CPL alvo não acordado.
`executaSozinho: false`.

## Build de produção e ZIP em sala limpa

| passo | resultado |
|---|---|
| `npm ci` em pasta limpa | ✅ |
| `npm run typecheck` | ✅ |
| `npm run test` | ✅ **46/46** |
| `npm run build` | ✅ 193 rotas |
| `npm run start` e resposta HTTP | ✅ `/api/health` 200, `/login` 200 |
| `/api/ready` sem `.env` | ✅ **503** — honesto, não falso verde |
| segredos no pacote | ✅ **0** em 3.046 arquivos |

---

## O que NÃO foi testado, e por quê

| item | motivo |
|---|---|
| **Telas com sessão no navegador** | exigiria digitar senha em formulário de login, coisa que não faço. Verifiquei a API ponta a ponta e renderizei componentes isoladamente com o CSS real. |
| **Envio de WhatsApp** | `WHATSAPP_PHONE_NUMBER_ID` ausente. |
| **Geração de texto por IA** | OpenAI sem saldo, Anthropic sem crédito. Só Perplexity responde. |
| **Gasto, CPL e CAC** | conta de anúncios responde `#200`. |
| **Caminho degradado do worker** (banco sem `tasks.metadata`) | derrubar a coluna só para testar apagaria as tarefas recém-criadas. |
| **Disparo para leads reais** | proibido por regra da operação. Nenhum foi feito. |
