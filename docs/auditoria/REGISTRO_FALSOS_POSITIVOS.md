# REGISTRO DE FALSOS POSITIVOS

**O histórico do erro não é apagado.** Um relatório que corrige o número e esconde
como errou ensina apenas o número; este registra o mecanismo, que é o que se repete.

---

## FP-01 — "109 migrations não aplicadas" *(o mais caro)*

| campo | conteúdo |
|---|---|
| **Resultado incorreto** | 109 das 177 migrations do repositório não constavam como aplicadas |
| **Onde se propagou** | `AUDITORIA_FINAL.md`, `ATLAS_ONE_SOURCE_OF_TRUTH.md` e **4 mensagens de commit** |
| **Por que parecia verdadeiro** | o projeto **já tinha** histórico de drift real; o número era grande e coerente com a suspeita; e vinha de um comparador que eu mesmo escrevera e no qual confiava |
| **Causa** | a coluna `name` de `supabase_migrations.schema_migrations` tem **dois formatos** — `20260711040000_atlas_v3_foundation` e `atlas_v3_foundation_base_tables`. O comparador removia o prefixo numérico **só do lado do repositório** |
| **Como foi descoberto** | ao produzir a matriz exigida pelo briefing, li a lista de nomes do banco e vi os dois formatos lado a lado. **Não** foi um teste que pegou |
| **Correção** | normalizar **ambos** os lados → 109 caiu para 4 |
| **Verificação dos 4** | objeto por objeto no schema: `move_pipeline_lead` ✔ · `commission_rules` ✔ · 3 views + 4 funções do grafo ✔ · as 4 funções da fila ✔ |
| **Drift real** | **0** |
| **Proteção contra recorrência** | `config/migrations-equivalencias.json` — equivalências **declaradas com evidência**, nunca adivinhadas |

### A tentação que veio depois, e por que foi recusada

Com 4 restantes, casar por sufixo (`x` casa com `x_algo`) derrubaria para 3 numa
linha. **Não fiz.** Essa heurística esconderia uma migration genuinamente ausente
cujo nome fosse prefixo de outra — trocaria falso vermelho por **falso verde**.

---

## FP-02 — comparação por VERSÃO *(pego antes de publicar)*

A primeira versão do mesmo comparador confrontava `version` (carimbo de **quando
aplicou**) com o prefixo do arquivo. Medido: o arquivo `20260731020000_…` virou a
linha `20260731013305` no banco. Nunca coincidiriam → `emDia: false` **permanente**,
inclusive num ambiente perfeito.

Corrigido antes de sair. **Falso vermelho custa tanto quanto falso verde**: portão
que grita todo dia ensina a ser ignorado, e no dia do alerta real ninguém olha.

---

## FP-03 — "a fila perdeu 2 leads pagas"

Dois eventos em `failed` foram tratados como perda comercial em vários relatórios.
Medido: o `leadgen_id` `1785279004691960`, lido como epoch, dá **exatamente
2026-07-28 22:50:04** — o próprio `received_at`. Os três IDs reais dão 2097, 2050 e
2004. O outro evento carrega `LG-91e584b979`, que nem formato da Meta é.

**Nenhum dos dois é lead real.** A fila nunca perdeu lead de cliente.

---

## FP-04 — "a Meta está bloqueada por permissão"

Repetido pela auditoria **e por mim**. Medido em `me/permissions`: **15 concedidas,
0 negadas** — incluindo `pages_read_engagement` e `leads_retrieval`, exatamente as
que o erro `(#10)` pede.

Quando o escopo existe e o acesso falha, o que falta é **atribuição de ativo**: a
página `1115087091694606` não está em `owned_pages` nem em `client_pages` do
Business Manager.

---

## FP-05 — "1 escrita no banco em `previsao-aritmetica`"

Meu grep contou `.delete(` sem distinguir alvo. Era `idsConhecidos.delete("")` —
um `Set` em memória, linha 165. **Zero escritas.**

---

## FP-06 — "`previsao-aritmetica` é órfã"

Classifiquei como D. Ela é importada por `gemeo-digital`, que tem rota. É **C**.
Meu levantamento de consumidores olhou o diretório errado.

---

## O PADRÃO — o que estes seis têm em comum

Cinco dos seis vieram de **instrumento incompleto**, não de raciocínio errado:

| erro | instrumento |
|---|---|
| FP-01 | normalizou um lado só |
| FP-02 | comparou o campo errado |
| FP-03 | não testou a hipótese do ID sintético |
| FP-04 | não leu `me/permissions` antes de concluir |
| FP-05 | grep sem distinguir alvo |
| FP-06 | busca no diretório errado |

**A lição operacional:** antes de acusar o código, confirme que o instrumento coleta
o que você acha que coleta. Um comparador que acusa 109 divergências num sistema que
funciona deveria levantar suspeita **sobre si mesmo** antes de virar achado.

E o corolário: **resultado alarmante exige verificar o outro lado.** FP-01 sobreviveu
a três documentos e quatro commits porque ninguém — inclusive eu — perguntou "e se o
comparador estiver errado?".

---

## NÚMEROS QUE FICARAM OBSOLETOS

| número | onde apareceu | correto |
|---|---|---|
| 109 / 108 migrations não aplicadas | AUDITORIA_FINAL, SOURCE_OF_TRUTH, 4 commits | **0** |
| "2 leads pagas perdidas na fila" | auditoria e relatórios | **0** — os dois são sintéticos |
| "token Meta sem permissão" | auditoria e relatórios | permissões **completas**; falta o ativo |
| "12 de 15 perfis são corretor" | matriz de módulos | **3 de 6** — 9 eram contas de teste |
