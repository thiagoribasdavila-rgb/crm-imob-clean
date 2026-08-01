# ATLAS ONE — V4

> Escrito em 2026-07-30, no commit `83bfec93`. Todo número aqui foi **medido**
> contra o banco vivo (`pozbrcsfthnhmnebfoxv`) ou contra o repositório. Onde não
> foi medido, está dito.

---

## 1. Comece por aqui: seis afirmações que caíram

Este projeto acumulou números que circulavam como fato e não resistiram a uma
consulta. Antes de planejar, o que foi **refutado** em 2026-07-30:

| circulava como fato | o que a medição mostrou |
|---|---|
| "o deploy não existe" | **está no ar** — `atlasaios.com.br/api/health` HTTP 200, `/api/ready` `database ok` |
| "4 corretores ativos" | **1 operador efetivo** — um perfil concentra 8 dos 10 contatos e a única venda |
| "482 leads" | **199 reais** — 283 vieram de importação, 270 num único lote de 6 minutos |
| "13 leads com recomendação" | `atlas_recommendations` = **0 linhas**. Os 13 tinham critério, não recomendação |
| "23 tabelas contra 127 migrations" | era **outro projeto**, aposentado. O canônico responde nas 20 tabelas testadas |
| "124 arquivos com service_role" | **193 de 201 rotas**, e 123 de 125 funções são SECURITY DEFINER |

**A lição de método, que vale mais que a lista:** cinco dessas seis vieram de
documentos e memórias do próprio projeto, repetidas sem reconsulta. Antes de usar
qualquer número deste repositório numa decisão, meça de novo.

---

## 2. O gargalo, medido

```
leads reais (fora do lote de importação) ................. 199
com primeiro contato registrado ........................... 10
SLA de primeiro contato VENCIDO sem contato ............... 462
eventos de esforço comercial (call + whatsapp) ............. 23
notas escritas por humano entre as leads sem critério ....... 4
leads com ao menos 1 critério decisivo respondido ........... 14
```

O motor de compatibilidade exige **1 critério decisivo avaliável**, e avaliável
exige dado dos **dois lados**. Só três critérios são decisivos: preço (peso 25),
bairro (18) e dormitórios (14).

**Consequência dura:** preencher catálogo não move a recomendação. Foi tentado
três vezes em 2026-07-30 — preço, bairro, tipo de produto e segmento — e o número
ficou parado. O que falta é do lado do cliente, e só a ligação traz.

---

## 3. As fases

Cada fase termina num **fato verificável**, não em "melhorar X". A métrica de cada
uma foi escolhida para **não poder ser satisfeita sem produzir resultado**.

### Fase 0 — a automação acorda

**Estado:** entregue do lado do código; bloqueado no acesso.

Foi medido que nenhum worker rodava: dois itens `meta.lead.fetch` com
`attempts = 0`, parados há 89h e 44h. `attempts = 0` é o sinal decisivo — de fora,
um worker **morto** e um worker **sem trabalho** são idênticos.

Feito: `/api/v1/ready` passou a publicar `agendamento`, com `nuncaTentadas`,
`maisAntigaHoras`, `agendadorParadoProvavel` e `segredoConfigurado` (booleano,
nunca o valor). A decisão vive em `lib/integrations/agendador-parado.ts`, com
contrato nos dois lados.

Falta, e **não é código**:
1. Permissão da página `1115087091694606` no Business Manager. Sem ela, a lead da
   Meta responde `HTTP 400 [100/33] Object does not exist` — o token não enxerga a
   página onde ela nasceu.
2. Um agendador chamando os workers no servidor que serve o domínio.
3. O `ATLAS_CRON_SECRET` de produção recusa o segredo local: ou é outro, ou não
   existe lá. O campo `segredoConfigurado` do `/api/ready` responde isso agora.

**Critério de saída:** `agendadorParadoProvavel: false` com fila não vazia.

### Fase 1 — o produto para de mentir

**Estado: fechada.**

`first()` pula `null` mas não `[]`. Como `preferred_regions` é array vazio nas 482
e nunca null, ela vencia sempre — e as 7 pessoas que declararam bairro apareciam
como se não tivessem declarado nada. O corretor era mandado perguntar de novo, na
mesma tela em que o painel de compatibilidade dizia o contrário.

`bedrooms` **não** tinha o defeito: a coluna é NULL, o fallback funciona.
Consertar "por simetria" teria estragado o que estava certo — o contrato tem teste
dos dois lados para impedir que alguém "complete" o conserto depois.

### Fase 2 — contato registrado

**Estado: não é problema de código.**

O botão de primeiro contato registra corretamente (`type: canal`), e é dele que
vêm os 23 eventos. `activities` tem 158 linhas 100% `pipeline_stage_changed` —
qualquer métrica que leia essa tabela vê zero esforço comercial e está lendo o
lugar errado.

São **23 contatos em ~11 leads de 199**. Isso é operação.

**Métrica que não se pode fraudar:** eventos `call`/`whatsapp` em `lead_events`
com `lead_id`, contados no banco, por corretor por dia. Não é clique de tela, não
é autorrelato.

### Fase 3 — recomendação vira registro

**Estado: não iniciada, por decisão.**

`atlas_recommendations` = 0. Persistir é uma hora de código — e criaria mais uma
escrita sem leitor, que é o defeito que o v4 existe para remover. **Só vale depois
que alguma tela consumir o histórico.**

### Fase 4 — o que só existe num disco

**Estado: parcial.**

Cinco migrations datadas de 20260730 existiam só numa máquina. Verifiquei uma a
uma chamando os objetos no banco:

```
VIVA     grafo_de_oportunidade_de_receita   → versionada
VIVA     orcamento_e_autonomia_da_ia        → versionada
AUSENTE  oferta_ativa_do_acervo · finops · geolocalizacao_postgis
```

As três ausentes ficam fora: versionar migration não aplicada convida alguém a
aplicá-la sem querer. Restam **58 arquivos** não rastreados, preservados em
`~/atlas-v3-backups/nao-rastreados-*.tar.gz`.

---

## 4. Fora do v4, declarado

Escopo que não diz o que exclui não é escopo.

**RLS e multi-tenant.** 193 de 201 rotas alcançam `service_role` e 123 de 125
funções são SECURITY DEFINER. Migrar não é trocar seis arquivos — é uma ordem de
grandeza a mais.
*Custo de deixar de fora:* não dá para colocar uma segunda imobiliária com
segurança.

**As 15 órfãs como projeto.** Só entra o que serve ao contato. As outras ficam
declaradas em `scripts/check-rotas-orfas.mjs`, com motivo, uma a uma.
*Custo:* trabalho pago rendendo zero, visível em vez de esquecido.

**A verba da Meta.** Dois bloqueios independentes — cap batido no centavo e saldo
de R$ 1,46 — mais as campanhas publicando numa página que o CRM não enxerga. Não
é software.

---

## 5. Os riscos que restam, e o sinal de cada um

| risco | o sinal de que se materializou |
|---|---|
| o agendador continua dormindo | `/api/ready` → `agendadorParadoProvavel: true` |
| lead da Meta some de novo | `integration_outbox` com `attempts = 0` envelhecendo |
| a captura não pega na operação | leads com ≥1 decisivo continua em 14 depois de uma semana |
| alguém aplica migration não aplicada | objeto novo no banco sem commit correspondente |
| volta a nascer rota inalcançável | `npm run rotas-orfas:check` reprova |
| contrato afrouxado sem ninguém ver | mutação sobrevive em `npm run teste:mutacoes` |

---

## 6. Como verificar tudo

```bash
npx tsc --noEmit          # 0 erros
npm run test:contracts    # 1087 testes · 0 falhas
npm run portoes:todos     # 219/219
npm run rotas-orfas:check # 201 rotas · nenhuma órfã nova
npm run provas:lista      # as 13 provas contra o banco vivo, por nome
npm run teste:mutacoes    # 182 mutações · ~6 a 9 horas, não roda em sessão curta
```

⚠ Para **inspecionar** `scripts/mutacoes.mjs`, use leitura de texto ou
`node --check`. Um `import()` **executa** a suíte inteira.

---

## 7. A primeira semana

**Dia 1** — desbloquear a página no Business Manager e pôr um agendador de pé.
Prova: `agendadorParadoProvavel: false` com fila não vazia.

**Dias 2 a 5** — o operador real usando, sem mexer em nada. O painel mostra a
pergunta de maior destrave, a resposta grava no mesmo lugar, e a ficha parou de
pedir o que já foi respondido. O indicador **14** responde se pegou.

**Não recomendo mais "duas semanas observando"** — com a automação morta, observar
seria observar um sistema quebrado e concluir que os corretores não usam.
