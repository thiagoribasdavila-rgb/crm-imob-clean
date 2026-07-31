# MATRIZ DE NÍVEIS DE AUTONOMIA

**Documento de desenho. Nada foi ativado.**
Aplica-se apenas aos módulos classificados como aptos em
`docs/auditoria/MATRIZ_REAL_MODULOS_IA.md`.

---

## OS SEIS NÍVEIS

| nível | nome | pode ler | pode sugerir | registra sombra | executa | exige humano |
|---|---|:--:|:--:|:--:|:--:|:--:|
| **0** | desligado | ✘ | ✘ | ✘ | ✘ | — |
| **1** | leitura e recomendação | ✔ | ✔ | ✘ | ✘ | — |
| **2** | Shadow Mode | ✔ | ✔ | **✔** | ✘ | — |
| **3** | sugestão com aprovação | ✔ | ✔ | ✔ | só após clique | **✔** |
| **4** | automação limitada | ✔ | ✔ | ✔ | dentro de regra e teto | por exceção |
| **5** | autonomia ampliada | ✔ | ✔ | ✔ | ✔ | por exceção |

**Nenhum módulo avança de nível automaticamente.** A promoção é ato humano
registrado no `DECISION_LOG.md`, e exige que os critérios do nível anterior tenham
sido **medidos**, não estimados.

### A diferença entre 1 e 2, que é onde as pessoas erram

No nível 1 a IA opina e ninguém guarda a opinião. No nível 2 **toda decisão que ela
teria tomado é gravada** e comparada depois com o que o humano fez. Sem o nível 2
não existe base para decidir se ela merece o nível 3 — a promoção viraria opinião
sobre opinião.

`lib/ai/registro-de-sombra` existe exatamente para isso, grava em
`ai_shadow_decisions` (hoje **0 linhas**), e não tem consumidor. **É o elo que
falta**, não um extra.

---

## POR MÓDULO

### `registro-de-modelos` — apto até o **nível 1**

| campo | valor |
|---|---|
| nível atual | **0** (alcançável por rota, sem tela) |
| teto recomendado agora | **1** |
| pré-requisitos p/ nível 1 | uma tela consumir a rota; declarar qual versão de modelo é a vigente |
| feature flag | `ATLAS_FLAG_REGISTRO_DE_MODELOS` |
| organização autorizada | apenas `7c8c71c1-…` |
| usuários | `director`, `admin` |
| leads elegíveis | não se aplica (não toca em lead) |
| limite de volume · custo · tokens | não se aplica — **zero provider** |
| timeout · fallback | 10 s · devolve "não medido" |
| aprovação humana | não exigida no nível 1 |
| rollback | desligar a flag |
| kill switch | `ATLAS_IA_PARADA=1` (global) |
| observabilidade | contagem de leitura por dia |
| métrica de qualidade | nenhuma previsão é emitida no nível 1 |
| critério de avanço p/ 2 | precisaria emitir previsão — **fora de escopo hoje** |
| critério de regressão | erro de leitura > 1% |
| critério de suspensão | qualquer escrita não prevista |

### `previsao-aritmetica` — apto até o **nível 1**

Baseline aritmético puro, **sem provider e sem estado**. Custo estruturalmente zero.

Pré-requisito: exibir o número **com o denominador e a janela**, nunca sozinho.
Métrica de qualidade: comparar a previsão de carga com a carga real observada — e é
justamente isso que exige o nível 2 depois.
Flag: `ATLAS_FLAG_PREVISAO_ARITMETICA`.

### `gemeo-digital` — **BLOQUEADO no nível 0 por dado, não por código**

| impedimento | medição |
|---|---|
| `broker_capacity_limits` | **0 linhas** → coluna "teto aplicado" nula em 100% |
| população do painel | 9 de 12 linhas eram contas de teste (desativadas em 30/07) |

Pré-requisito para sair do nível 0: `broker_capacity_limits` com linha real para
cada corretor ativo, e a lista de corretores conferida sem conta de teste.
**Antes disso a tela mostra número sem significado**, que é o defeito que este
projeto mais paga.

### `modo-sombra` · `niveis-de-autonomia` · `registro-de-sombra`

Não são módulos a promover: são a **infraestrutura da promoção**. Precisam estar
ligados **antes** de qualquer outro chegar ao nível 2.

Pré-requisito único: um agente que decida em sombra. Hoje não existe — e é por isso
que a cadeia termina em nada.

### `grafo-de-receita` · `estado-de-credencial`

Nível 0. Sem rota, sem tela. `estado-de-credencial` é o candidato natural a
alimentar `/api/v1/ready`; `grafo-de-receita` tem as views no banco e precisaria de
rota + tela.

---

## O REGISTRO OBRIGATÓRIO DE TODA EXECUÇÃO FUTURA

A partir do nível 2, **nenhuma execução pode acontecer sem gravar**:

```
organization_id · user_id · lead_id
modulo · versaoDoModulo
provider · modelo · promptRef        ← referência, NUNCA o prompt com dado pessoal
entrada · saida · decisao · justificativa · confianca
tokensEntrada · tokensSaida · custoEstimado · duracaoMs
nivelDeAutonomia · shadowModeAtivo
aprovacaoHumana (quem, quando) · acaoExecutada · resultado · erro
correlationId · idempotencyKey · rollbackPossivel
criadoEm · atualizadoEm
```

**`promptRef`, não `prompt`.** Gravar o prompt inteiro copia dado de cliente para
uma segunda tabela, com outra política de retenção e outro conjunto de leitores.
A referência aponta para a versão do template; as variáveis ficam onde já estão.

**`idempotencyKey` é obrigatória desde o nível 3.** Sem ela, um retry executa a ação
duas vezes — e no nível 3 a ação já tem efeito no mundo.

---

## O QUE NENHUM NÍVEL AUTORIZA

Independentemente do nível, permanecem proibidos sem decisão humana explícita e
individual:

- disparo em massa;
- alteração de orçamento de mídia;
- exclusão de dado;
- publicação externa;
- redistribuição de carteira em volume;
- promessa de preço, estoque ou financiamento;
- alteração de permissão.

Estes não são "nível 6": são **fora da escala**.
