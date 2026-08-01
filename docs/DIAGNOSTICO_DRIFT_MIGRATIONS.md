# DIAGNÓSTICO DO DRIFT DE MIGRATIONS

**2026-07-31. Somente leitura. Nenhuma migration foi aplicada.**

---

## O VEREDITO, ANTES DO RACIOCÍNIO

> **O drift real é ZERO.** As "109 migrations não aplicadas" que este projeto
> reportou — inclusive em `AUDITORIA_FINAL.md`, no `ATLAS_ONE_SOURCE_OF_TRUTH.md`
> e em quatro mensagens de commit — eram **falso positivo do comparador que eu
> mesmo escrevi**.
>
> Todo objeto de toda migration do repositório existe no schema real.

---

## AS TRÊS PERGUNTAS

### 1. Por que 177 migrations no repositório?

`supabase/migrations/*.sql`, contagem direta: **177 arquivos**, de
`20260711030000_atlas_v3_foundation_base_tables.sql` a
`20260731050000_auxiliares_e_fronteira_do_relogio.sql`. É o histórico acumulado do
projeto.

### 2. Por que 223 registros no banco?

`supabase_migrations.schema_migrations`: **223 linhas, 218 nomes distintos** (5
duplicados por reaplicação). São **mais** que os 177 do repositório porque incluem:

- **15 migrations que existem só no banco**, aplicadas via API e nunca gravadas como
  arquivo — entre elas `explicit_data_api_grants`, `harden_internal_trigger_functions`,
  `phase_7_operational_recovery` e várias que **eu apliquei nesta sessão**
  (`auxiliares_de_prova_do_relogio`, `prova_de_fronteira_do_relogio`,
  `reivindicacao_com_recorte_de_topico`);
- **5 reaplicações** do mesmo nome em versões diferentes.

### 3. Por que 109 apareciam como não aplicadas?

**Por um defeito no meu comparador.** A coluna `name` do banco tem **dois formatos
convivendo**:

| formato | exemplo | origem |
|---|---|---|
| com prefixo | `20260711040000_atlas_v3_foundation` | registro em massa de 21/07/2026 |
| sem prefixo | `atlas_v3_foundation_base_tables` | aplicadas via API (`apply_migration`) |

O comparador tirava o prefixo numérico **só do lado do repositório** e comparava
contra o `name` cru do banco. Toda migration registrada com prefixo virava "não
encontrada".

Medido, normalizando os dois lados:

| comparação | resultado |
|---|---|
| só o repositório normalizado *(a versão com defeito)* | **109 faltando** |
| **os dois lados normalizados** *(correta)* | **4 faltando** |
| → falso positivo | **105** |

---

## AS 4 RESTANTES: "NÃO REGISTRADA" NÃO É "NÃO APLICADA"

Esta é a distinção que o briefing exigiu, e ela muda o resultado por completo.
Para cada uma das 4, verifiquei se o **objeto existe no schema real**:

| migration do repo | registrada como | objeto verificado | existe |
|---|---|---|---|
| `corrige_move_pipeline_lead` | `corrige_move_pipeline_lead_coluna_title` | função `public.move_pipeline_lead` | **✔** |
| `regras_de_comissao` | *(nome diferente)* | tabela `public.commission_rules` | **✔** |
| `grafo_de_oportunidade_de_receita` | *(nome diferente)* | `vw_grafo_demanda`, `vw_grafo_oferta`, `vw_grafo_censo_de_arestas`, `private.ator_alcanca_lead`, `grafo_clientes_para_empreendimento`, `grafo_aptidao_do_corretor` | **✔ todos** |
| `auxiliares_e_fronteira_do_relogio` | 3 nomes separados | `posiciona_evento_de_prova`, `envelhece_lock_de_prova`, `reivindica_eventos_da_fila`, `prova_de_fronteira_do_relogio` | **✔ todos** |

**As quatro estão aplicadas.** A divergência é de *nome de registro*, não de schema.

A causa é conhecida e é minha: `apply_migration` grava o `name` que **eu** passo, e
eu nem sempre usei o mesmo nome do arquivo. Em `auxiliares_e_fronteira_do_relogio`
apliquei em três chamadas separadas, com três nomes, e depois consolidei num arquivo
só.

---

## O QUE ISSO CORRIGE NO REGISTRO

Estes documentos e commits afirmam um número que agora sei estar errado:

| onde | o que diz | correto |
|---|---|---|
| `AUDITORIA_FINAL.md` | drift de migrations como achado | o drift de schema é **zero** |
| `ATLAS_ONE_SOURCE_OF_TRUTH.md` §4 | "o repo **não** reconstrói o banco" | **parcialmente falso** — ver ressalva abaixo |
| commit `17db153e` | "108 não aplicadas" | 0 |
| commit `ba2093e0` | "109 de 177 não constam" | 4, todas aplicadas |

### A ressalva que continua verdadeira

Um clone limpo **ainda não reconstrói o banco**, mas por outro motivo: as **15
migrations que existem só no banco** não têm arquivo. Quem aplicasse os 177 arquivos
numa base nova ficaria sem elas. Esse é o drift **real e remanescente** — e ele é
muito menor e mais preciso que "109".

---

## SEGUNDO FALSO VERMELHO NA MESMA FUNCIONALIDADE

Vale registrar como padrão, não como acidente:

1. **Primeira tentativa:** comparava `version` (carimbo de aplicação) com o prefixo
   do arquivo. Nunca coincidiam → `emDia: false` **permanente**. Pego antes de
   publicar.
2. **Segunda tentativa:** comparava por nome, mas normalizava **um lado só** →
   109 falsos. Publicado, e propagado para três documentos e quatro commits.

O erro não é a lógica de comparação: é ter aceitado um resultado alarmante **sem
verificar o outro lado**. Um comparador que acusa 109 divergências num sistema que
funciona deveria ter sido suspeito de si mesmo antes de virar achado de auditoria.

**A verificação que faltava** era a que o briefing pediu: *não assuma que "não
registrada" significa "não aplicada"* — olhe o schema.

---

## DECISÃO RECOMENDADA

**Nenhuma migration deve ser aplicada.** Não há o que aplicar.

O que resta é higiene de registro, e é opcional:

1. **Versionar as 15 que só existem no banco** — para o repositório voltar a
   reconstruir uma base do zero. É trabalho de extração de `statements` da tabela
   `schema_migrations`, sem risco, e sem urgência.
2. **Não renomear nada no histórico.** Reescrever `name` em
   `supabase_migrations.schema_migrations` para "alinhar" seria falsificar o
   registro do que aconteceu.
3. **Ao usar `apply_migration`, passar o mesmo nome do arquivo.** É a origem das 4
   divergências restantes, e é disciplina, não código.

## ROLLBACK

Nada foi alterado no banco. O único código mudado é o comparador em
`app/api/v1/ready/route.ts`; reverter faz o número voltar a 109 — ou seja, reverter
**reintroduz** o falso positivo.
