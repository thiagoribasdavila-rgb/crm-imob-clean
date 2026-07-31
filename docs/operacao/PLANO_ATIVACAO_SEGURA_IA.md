# PLANO DE ATIVAÇÃO SEGURA DA IA

**Documento de desenho. NADA foi ativado nesta fase.**
Entrada: `docs/auditoria/MATRIZ_REAL_MODULOS_IA.md`.
Complementos: `MATRIZ_NIVEIS_AUTONOMIA.md` · `PLANO_KILL_SWITCH.md`.

---

## O PONTO DE PARTIDA HONESTO

Os oito módulos estão desligados **por ausência de consumidor**, não por controle.

Isso importa mais do que parece: um módulo desligado por falta de chamador volta a
ligar no dia em que alguém escrever o `import`. Um módulo desligado por **flag**
exige uma decisão. Hoje, **nenhum dos oito tem feature flag** — e essa é a primeira
lacuna a fechar, antes de qualquer ativação.

| medição | valor |
|---|---|
| módulos com provider de IA | **0 de 8** |
| módulos que chamam serviço externo | **0 de 8** |
| módulos que escrevem em `leads` | **0 de 8** |
| módulos com feature flag | **0 de 8** |
| custo de IA hoje (30 d) | **USD 0,011459** em 43 eventos |

---

## A ORDEM DE ATIVAÇÃO — e por que ela não começa pelo mais útil

A tentação é ligar `gemeo-digital` primeiro: é o maior (992 linhas), tem rota, e
mostraria carteira por corretor. **Está bloqueado por dado** —
`broker_capacity_limits` tem 0 linhas, e a coluna "teto aplicado" apareceria nula em
100% das células.

A ordem correta é a que constrói a base de decisão antes de decidir:

### Passo 1 — a infraestrutura de flags *(nenhuma IA ligada)*

Criar o mecanismo, com padrão **desligado**, e fazer `/api/v1/ready` publicar o
estado de cada flag. Sem isto, "ativar em fase 1" não tem como ser revertido sem
deploy.

Critério de conclusão: `/ready` lista as flags, todas em `false`, e o contrato
prova que ausência de variável = desligado.

### Passo 2 — `estado-de-credencial` no nível 1

O de menor risco: sem provider, sem escrita, sem lead. Alimenta a prontidão, que
hoje deriva estado de credencial por outro caminho — **e duas fontes para o mesmo
fato é a doença que este repositório mais paga**. Ligá-lo *remove* uma verdade
duplicada em vez de criar uma.

### Passo 3 — `previsao-aritmetica` no nível 1

Baseline puro, custo estruturalmente zero. Exibe carga de equipe e tempo até
esgotar fila, **sempre com denominador e janela**.

Regra inegociável: número sem denominador é o defeito que fez "442 leads" virar dado
sem significado nesta base.

### Passo 4 — a tríade do Shadow Mode ligada em conjunto

`modo-sombra` + `niveis-de-autonomia` + `registro-de-sombra`, com um agente que
decida em sombra. É o **nível 2**, e é o único caminho para qualquer nível 3: sem
histórico de "o que a IA teria feito × o que o humano fez", promover é opinião sobre
opinião.

Critério de conclusão: `ai_shadow_decisions` com linhas reais e a comparação
medida — não estimada.

### Passo 5 — reavaliar `gemeo-digital`

Somente depois de `broker_capacity_limits` ter linha real por corretor ativo.

### Passo 6 — `registro-de-modelos` e `grafo-de-receita` no nível 1

Ambos precisam de tela. `grafo-de-receita` já tem as views no banco.

---

## O QUE NENHUM PASSO INCLUI

- nenhum provider de IA é chamado até o passo 4;
- nenhuma escrita em `leads` em nenhum passo;
- nenhum disparo, campanha ou mensagem;
- nenhuma promoção automática de nível.

---

## CRITÉRIOS DE SUSPENSÃO IMEDIATA

Qualquer um destes derruba o módulo para o nível 0, sem discussão:

- escrita não prevista em qualquer tabela;
- custo acima do teto diário;
- divergência entre o que a tela mostra e o que o banco diz;
- qualquer número publicado sem denominador ou sem janela;
- qualquer decisão automática sem linha correspondente no registro de auditoria.

O último é o mais importante: **decisão sem rastro é decisão que não aconteceu**,
e um sistema que decide sem registrar não pode ser auditado depois do incidente.

---

## ESTIMATIVA DE CUSTO

Hoje: **USD 0,011459 em 30 dias**, 43 eventos, dos quais 22 com `provider=local` e
custo real zero.

Passos 1 a 3 não acrescentam custo — nenhum chama provider.
O passo 4 é o primeiro com custo, e ele deve nascer **com teto**, não com estimativa.
A faixa declarada pelo dono é R$ 300–1.000/mês; o teto diário deve ser derivado dela
e **bloquear**, não apenas registrar.
