# O que falta para 10/10 — medido em 2026-07-30

Escrito no fim de uma sessão de 38 commits, com quatro sessões paralelas ainda
escrevendo no repositório. Tudo aqui foi **medido**, não estimado. Onde não foi
medido, está escrito "não medido".

---

## 1. O que decide a operação, e não é código

**Preço.** Zero em 4 de 4 empreendimentos. Zero em 6 de 6 tipologias.
`units`, `inventory_units`, `properties`: zero linhas. O motor de compatibilidade
recomenda para **12 de 482 leads**.

E a assimetria é o que importa:

| bairro | demanda | empreendimento | tipologias |
|---|---|---|---|
| **Perdizes** | **174** | 1 | **0** |
| Paraíso | 11 | 1 | 0 |
| **Aclimação** | **0** | 1 | **6** |

O único empreendimento com catálogo completo é o único sem demanda. Preencher
preço de **um** empreendimento destrava 482 leads de uma vez; perguntar orçamento
destrava um cliente por ligação.

**Sem isso, corretor abre o CRM com 376 leads esperando e nada para oferecer.**

---

## 2. Cinco itens de ambiente, todos do dono

1. **`ATLAS_ENV=homologation`** no `.env.local`.
   Hoje está `production`, com URL de produção e banco de homologação. Três
   verdades sobre o mesmo fato, duas erradas. Enquanto isso durar,
   `npm run test:real` mede um ambiente e valida contra outro — e **aprova**.
   Vigiado por `npm run coerencia-ambiente:check`.

2. **Relinkar o CLI do Supabase.**
   `supabase/.temp/project-ref` aponta para `ietwopslgqxlenfyghqk` — o projeto
   APOSENTADO, com 17.151 leads reais. É estado VIVO da ferramenta, não
   documentação: `supabase db push` mira nele mesmo com todos os scripts e
   roteiros já corrigidos.

3. **`.env.hostinger`** aponta `NEXT_PUBLIC_SUPABASE_URL` e `DATABASE_URL` para o
   mesmo projeto aposentado. Deploy com esse arquivo conecta a app no banco errado.

4. **Confirmar o SMTP** no painel do Supabase. O `/api/ready` derivava o status de
   e-mail da checagem do BANCO — status que nunca podia ficar vermelho. A mentira
   foi corrigida; a verificação é do dono. Se for o SMTP padrão, recuperação de
   senha falha em produção com a prontidão verde.

5. **Publicar.** 130+ commits só na máquina do dono. Sem isso não há teste real
   nem rollback.

---

## 3. Verificação — o que falta fechar

| | estado medido |
|---|---|
| contratos | 1001, **zero falhas** (o número oscila: as frentes paralelas somam) |
| portões | 218/218 |
| mutações | última corrida completa: **165/168** |
| build · lint · tsc | limpos |
| `release:prebuild-check` | **aberto** (estava fechado antes desta sessão) |

Os três sobreviventes da corrida de 165/168:
- **1 era meu, e já foi corrigido** — a asserção contava ocorrências de
  `estaNaMinhaCarteira` em vez de provar a decisão; `if (false)` sobrevivia.
  Provado depois: 12/12 com a trava, 11/12 sem.
- **2 pertencem à oferta ativa**, que está no stash. Mutação sem contrato
  correspondente sempre sobrevive — elas devem voltar com a entrega.

⚠ A corrida de mutação **precisa ser refeita**: outra sessão renumerou
`scripts/mutacoes.mjs` depois dela, e as mutações de geolocalização (M132..M139)
entraram em seguida.

---

## 4. As três entregas refutadas, guardadas com as correções nomeadas

`git stash list`:

- **`stash@{0}` — oferta ativa, parte 2/2.** As mudanças em rotas VIVAS que
  ficaram para trás: `next-best-action` excluindo o acervo da fila "sem dono", e
  `crm/leads` com o recorte `?acervo=`. **Restaurar junto com a parte 1/2** — um
  comentário nela referencia `POST /api/v1/crm/acervo`, que está no outro stash.
- **`stash@{1}` — oferta ativa, parte 1/2.** REFUTADA 3 de 3. Corrigir:
  (1) a tela não hidrata `?acervo=` e a API exclui `arquivado` → **o corretor
  pegava 10 leads e via 1**; (2) `filaHonesta = false`; (3) `poolParcial = false`;
  (4) contratos comportamentais (que criam usuário e disputam corrida contra o
  banco) **não podem viver em `test:contracts`**, que roda uma vez por mutação —
  foi isso que derrubou a rede de mutação inteira.
- **`stash@{2}` — corte da fila do corretor.** Refutado por 2 de 3. Corrigir:
  (1) `getSupabaseAdmin` numa rota de corretor viola `broker-dashboard:check`;
  (2) usar `filtroDaCarteiraDaPessoa`, não `filtroDaMinhaCarteira`;
  (3) contratos que exercitam a função pura sem provar que a rota usa o resultado.

---

### 4.1 Os TENTÁCULOS — o achado que só apareceu ao consertar o ambiente

Guardar a oferta ativa em `stash` levou **três tentativas**, e cada uma revelou
uma camada que a anterior não viu. Registrado porque é a forma do erro, não o
caso: **entrega refutada tem raiz mais funda que a lista de arquivos novos.**

- **parte 1/2** — os arquivos NOVOS (rota, lib, painel, migration, contrato).
  Parecia a entrega inteira.
- **parte 2/2** — as mudanças em rotas VIVAS que ficaram para trás:
  `next-best-action` excluindo o acervo da fila "sem dono", `crm/leads` com o
  recorte `?acervo=`. Um comentário ali referenciava `POST /api/v1/crm/acervo`,
  que já estava no outro stash.
- **parte 3/3** — os IMPORTS pendurados: `command-center/page.tsx` importava
  `OfertaAtivaDoAcervoPanel`, `broker-daily/route.ts` importava
  `lib/crm/acervo-de-resgate`, `distribution/route.ts` referenciava `/crm/acervo`.

**Com as partes 1 e 2 guardadas e a 3 não, o build estava QUEBRADO com TS2307 — e
nenhum check meu pegou**, porque `tsc` não estava na cadeia que eu rodava
(`test:contracts` + `portoes:todos`). Quem pegou foi o `daily:check`, por
acidente, ao rodar lint sobre arquivos alterados.

**Lição para a próxima:** ao guardar entrega refutada, rode `npx tsc --noEmit`
ANTES de declarar a separação completa. Import pendurado não aparece em contrato
nem em portão de conteúdo — só no compilador.

**As três partes voltam JUNTAS.** Restaurar uma sozinha quebra o build.

### 4.2 Consequência ainda aberta

O revert da parte 3/3 devolveu `broker-daily/route.ts` ao estado de HEAD, e isso
fez cair 2 contratos meus de mais cedo (`a rota do corretor lê as colunas de SLA`
e `o bônus de prioridade decide por coluna`). Não foi consertado: cinco sessões
editaram esse arquivo em camadas intercaladas, e reconciliá-lo com contexto no fim
foi o que produziu os piores erros desta sessão. **Precisa de uma sessão com
contexto inteiro, depois que as tarefas paralelas aterrissarem.**

---

## 5. As fases, contra o gate do próprio documento

**FASE 1 — NÃO APROVADA.** A especificação diz *"não aprovar sem teste ponta a
ponta"*, e ele nunca rodou publicado. O que já está de pé: login, RLS fechada nas
duas camadas, entrada de lead, dedup, SLA, primeiro contato, pipeline, tarefas,
agenda, Command Center com dado real, build. O que falta: os itens 1 e 2 acima.

**FASE 2 — gate não atendido**, e por medição: exige "custo por lead atendido
conhecido". O Cost Center cobre uma fração do custo e declara o resto como
"não medido" (correto). Não existe receita apurada.

**FASE 3 — entregou o que era permitido, a custo R$ 0.** Grafo em Postgres
(3 views + 9 funções, zero tabela nova), digital twin, previsão governada, e os
seis documentos. E **recusou responder 5 das 7 perguntas do dono** por falta de
dado — isso é a entrega correta, não uma entrega incompleta:

| pergunta | veredito calculado |
|---|---|
| leads semelhantes | **sim** — 192 leads, 8 fontes |
| oportunidades de recuperação | **sim** — 474 recuperáveis |
| clientes para estoque novo | não — **zero** pares de bairro comparáveis |
| imóveis substitutos | não — 1 lead de co-interesse, mínimo 2 |
| corretor mais adequado | não — 87 dos 88 desfechos são de **uma** pessoa |
| campanha por perfil | não — 2 vitórias, ambas na mesma campanha |
| demanda × oferta | não — bairro em 1,2%, zero unidades no acervo |

E a distinção que mais importa: **474 recuperáveis não são 474 contatáveis.**
`lead_contact_preferences` tem zero linhas — a base legal hoje vem da FONTE, não
da pessoa. A função se recusou a ter uma coluna `pode_contatar`.

---

## 6. A venda de amanhã

O fluxo grava `sale_value_brl` só quando o valor vem no pedido — e isso está
certo: travar o "ganho" faria o corretor deixar a lead em "proposta", e aí se
perde o desfecho, não só o número. A CAPI também recusa emitir `Purchase` sem
valor, de propósito.

O que faltava era **cobrar depois**, e há prova viva: a lead da Monique Teles está
em `ganho` com `sale_value_brl` NULO — 4 dias, crítica. Uma linha assim quebra
quatro coisas: VGV zerado, ROI incalculável, nenhum baseline para previsão, e o
`Purchase` nunca sai.

`GET/POST /api/v1/crm/vendas-sem-valor` cobra sem bloquear. **Mas quem digita o
número é o dono.**

---

## 7. Dívida estrutural que nenhuma sessão fecha sozinha

**O repositório não reconstrói o banco.** 166 versões de migration locais, 207 no
banco, **interseção ZERO** — `db push` aborta (falha fechada, não aplica nada).
Enquanto isso for verdade, "10/10" não pode significar "deployável a partir do
repo". Recomendação: homologação sai de **dump-restore** e as migrations são
documentação. A alternativa são ~373 `supabase migration repair`, que é risco sem
retorno.

**Resíduo de agente na base — pior do que eu havia reportado.** Além das 8
organizações `ZZ CONTRATO GEO` (zero leads, zero perfis), medido em 2026-07-30:

```
perfis de teste ATIVOS   access_role='admin'  → 9, TODOS com escopo raiz
                         access_role='broker' → 9
```

Os nove `admin` raiz vêm de nomes como `VARREDURA (apagar)`, `Fronteira` e
`CONTRATO-GRAFO-*`. **Perfil admin de teste, ativo, com escopo raiz, numa base
que vai receber teste real** é o item mais sério da lista de limpeza — mais que
as organizações vazias. Não apagados: perfil cascateia (a FK
`audit_logs.actor_id → profiles` trava o delete e o supabase-js devolve o erro
como `{}` vazio, então quem não confere fica com usuário órfão), e a decisão é
do dono.

### 7.1 A HIERARQUIA TEM TRÊS NÍVEIS, e isso não está escrito em lugar nenhum

Descoberto levando o erro duas vezes ao criar um usuário descartável de
liderança. `private.validate_commercial_hierarchy` exige:

```
access_role='broker'          → reports_to alguém com access_role='director'
access_role='director'        → reports_to alguém com access_role='director_decisor'
                                (senão: operational_director_requires_decision_director)
access_role='director_decisor'→ reports_to NULL (escopo raiz)
                                (senão: executive_role_requires_root_scope)
```

O `director_decisor` raiz real é `6f150832-4c97-42a7-954e-eea962a003fa`
(Thiago Ribas D'Avila). E o gatilho reage ao `access_role`, **não** ao
`commercial_role` — trocar `commercial_role` para `manager` não contorna nada.

Receita completa e reexecutável em
`scratchpad/prova-venda-sem-valor.mjs`, que também cobre a espera de ~1,8 s pelo
gatilho assíncrono `handle_new_auth_user` e o `full_name` NOT NULL.

### 7.2 A rota da venda está PROVADA ponta a ponta

Executado contra a base viva em 2026-07-30, com sessão real de gerência, 17 de 17:
a venda real (Monique Teles) aparece na cobrança · valor zero, negativo e texto
recusados com 422 · valor válido grava as DUAS colunas · a venda informada sai da
fila e a real continua · denominador presente · limpeza confirmada.

**Nunca foi escrito valor na venda real** — a prova cria a própria venda, exercita
os dois lados nela, e apaga.

---

## 8. O ZIP honesto

```bash
npm run test:contracts && npm run teste:mutacoes && npm run portoes:todos \
  && npm run build && npm run package:hostinger
```

Se os quatro primeiros passarem, o pacote merece o rótulo "testado". Se algum
falhar, o pacote diria o que o comando acabou de negar.

⚠ Não empacotar com sessões paralelas escrevendo: o `mutacoes.mjs` foi renumerado
no meio desta sessão e a contagem de contratos oscilou de 1025 para 1001 entre
duas medições. ZIP tirado nesse estado não corresponde a nenhuma verificação.

---

## 9. As três armadilhas que mais custaram hoje

Ficam escritas porque vão reaparecer.

1. **Contar ocorrência não prova decisão.** Três vezes: o identificador sobrevive
   na linha do `import`, ou nas linhas que calculam a variável. `if (false)` passa.
   Case a CONDIÇÃO, dentro da região, e proíba a forma neutralizada.
2. **Guarda que proíbe NOMEAR o problema** reprova por causa do comentário que o
   explica — cinco vezes. Remova comentários antes de conferir, ou case a forma
   executável.
3. **Substituição global não distingue instrução de registro histórico.** Um
   `perl -pi` trocou o ref dentro de um aviso "NÃO EXECUTAR" e o fez acusar o
   projeto certo. Classifique arquivo por arquivo antes de substituir.

E a maior: **portão verde não é prova.** Uma entrega passou 605 contratos e 51
mutações e estava errada. A rede de mutação voltou a rodar nesta sessão e a
primeira coisa que fez foi reprovar um ponto cego meu, no valor que vira comissão.
Só a refutação adversarial com default REFUTADO pegou o que a suíte não pegava.
