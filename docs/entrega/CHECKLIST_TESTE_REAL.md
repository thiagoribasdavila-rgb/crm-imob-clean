# Checklist de teste real — evidências

Tudo aqui foi executado contra o **banco de homologação real**
(`pozbrcsfthnhmnebfoxv`) com sessão HTTP autenticada, salvo onde indicado.
Nada foi simulado, e o que não pôde ser testado está marcado como tal — não como
aprovado.

## Como reexecutar

```bash
npm run smoke:ciclo
```

Percorre a vida de uma lead de Meta Ads em 36 etapas. **Cria a própria lead e o
próprio corretor, e apaga os dois no fim** — nenhuma lead existente é tocada.

> O alvo é sempre `localhost`. Só `ATLAS_SMOKE_BASE_URL` redireciona, e ele
> avisa quando não é local: a primeira versão deste smoke herdou `ATLAS_BASE_URL`
> do `.env.local` e testou **o build em produção** sem ninguém pedir.

---

## Ciclo operacional — 36/36

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

## Fluxos que estavam sem teste — agora cobertos

Estavam marcados como "sem teste com sessão". Eram testáveis pela API
autenticada como todo o resto: era lacuna do teste, não limitação do ambiente.

| fluxo | resultado |
|---|---|
| criar tarefa | ✅ 201 |
| **agendar visita** (agenda) | ✅ 201 · agenda carrega 200 |
| catálogo de empreendimentos é da diretoria | ✅ corretor recebe **403** — regra funcionando |
| empreendimentos carregam para o corretor | ✅ **4 projetos** |
| **mover a lead de etapa no pipeline** | ✅ 200 |
| **a etapa PERSISTE no banco** | ✅ `qualificacao` |
| **chamada de IA** | ✅ **gerou recomendação** |
| corretor NÃO acessa consolidado da diretoria | ✅ **403** |
| entrada inválida devolve 400 **com mensagem** | ✅ |
| health check · readiness · logout | ✅ · ✅ · ✅ |

> Três falharam na primeira execução e as três eram **contrato errado no teste**,
> não defeito: a agenda não mora em `/calendar` (que é leitura), o catálogo de
> empreendimentos é da diretoria por desenho, e o PATCH da ficha valida o
> registro inteiro. Corrigidos e reexecutados.

## O que segue sem teste, e por quê

| item | motivo | classificação |
|---|---|---|
| **Telas com sessão no navegador** | exigiria digitar senha em formulário de login, coisa que não faço. A API está coberta ponta a ponta e os componentes foram renderizados com o CSS real. | limitação declarada |
| **Envio de WhatsApp** | `WHATSAPP_PHONE_NUMBER_ID` ausente | bloqueado por credencial |
| **Geração de texto por OpenAI/Anthropic** | sem saldo / sem crédito. **Perplexity gera** — o caminho de IA está provado. | bloqueado por serviço |
| **Gasto, CPL e CAC** | conta de anúncios responde `#200` | bloqueado por permissão |
| **Caminho degradado do worker** (banco sem `tasks.metadata`) | derrubar a coluna só para testar apagaria as tarefas | risco maior que o ganho |
| **Disparo para leads reais** | proibido por regra da operação | não aplicável |

---

## Roteiro extra — o que a auditoria de 26/07 corrigiu

Cada item abaixo estava quebrado e **não dava erro na tela**. Vale conferir os
sete depois do deploy, porque são exatamente os que passariam despercebidos de
novo.

| # | tela | o que fazer | resultado esperado |
|---|---|---|---|
| 1 | Leads | filtrar por empreendimento "Inside Perdizes" | a lista mostra as leads dele, não vazia |
| 2 | Leads | filtro de atenção → "Atrasadas" | devolve as leads com próxima ação vencida |
| 3 | Leads | próxima ação → "Agendada" | devolve as leads com ação futura marcada |
| 4 | Agenda | abrir a semana | aparecem follow-ups, não só tarefas |
| 5 | Agenda | olhar uma visita agendada | mostra o NOME do cliente, não "Cliente" |
| 6 | Clientes 360 | olhar as lacunas de um cliente com projeto e finalidade | não acusa "sem projeto" nem "sem finalidade" |
| 7 | Distribuição / Corretores | listar as pessoas | todos com nome, ninguém como "Usuário Atlas" |
| 8 | Projetos | abrir a lista de empreendimentos | Inside Perdizes mostra as leads dele, não zero |

### Números que precisam continuar honestos

| onde | quando o dado falta | o que TEM que aparecer |
|---|---|---|
| Pipeline · "Pipeline" e "Forecast" | menos de 40% da carteira com orçamento | "—" e quantos negócios faltam preencher — nunca R$ 0 |
| Pipeline · valor da coluna | nenhuma lead da etapa com orçamento | "orçamento não informado" — nunca R$ 0,00 |
| Relatórios · "investimento" | Meta sem responder | "não medido" — nunca R$ 0 |
| Relatórios · linha da incorporadora | idem | "Não conectado" — nunca R$ 0,00 |
| Relatório do parceiro · CPL | gasto não lido | a ressalva declarada no book — nunca R$ 0,00 |

**Se qualquer um desses mostrar zero em vez da ausência, é regressão.** O padrão
que a auditoria desfez foi exatamente esse: soma vazia virando "nada" em vez de
"não sei", em números que decidem verba.

### Coluna do Kanban com muitos cards

A etapa "novo" desenha os 25 mais prioritários e declara quantos ficaram de
fora, com link para a fila completa. Se aparecer "+N nesta etapa" sem link, ou
se a coluna voltar a desenhar tudo, é regressão.
