# RELATÓRIO DO DESIGN SYSTEM

**2026-07-31.**

## O ESTADO MEDIDO

| medida | número |
|---|---:|
| arquivos `.tsx` rastreados | 289 |
| ocorrências de hex (`#rrggbb`) | **1.359** |
| arquivos com hex cravado | **80** (28%) |
| usos de `var(--atlas-*)` | 271 |
| `style={{ … }}` inline | 304 |
| componentes duplicados (Modal, Drawer, Spinner, Skeleton, Toast) | **0** |
| `Tooltip` | 1 definição |

## A MIGRAÇÃO DE COR **NÃO FOI EXECUTADA** — e a razão

O briefing pede explicitamente: *"não faça uma substituição automática cega que
altere gráficos, estados de erro, status comerciais ou contraste"*.

Das 1.359 ocorrências, uma parte relevante está em:

- **estados semânticos** — `emerald` para ganho, `rose` para perda, `amber` para
  alerta. Trocar por token neutro apaga a informação que a cor carrega;
- **gráficos** — séries que precisam ser distinguíveis entre si;
- **superfícies com alpha** — `bg-white/[.03]`, que já causou uma regressão real
  no tema claro e foi corrigida caso a caso.

Migrar isso exige **prova em tela por lote**. Um `sed` em 80 arquivos numa
sessão sem verificação visual por tela trocaria um problema medido por um
problema não medido — e é exatamente o tipo de "melhoria" que esta auditoria
existe para impedir.

**O que fica registrado:** o número (1.359), os arquivos (80), a razão de não
ter sido feito agora, e o método correto — lotes por família de cor, com captura
de tela antes/depois em tema claro **e** escuro.

## O QUE **NÃO** ESTÁ QUEBRADO — e vale dizer

O risco clássico de um produto desta idade é ter três modais, quatro loaders e
duas bibliotecas de ícones concorrendo. **Medido: zero componentes duplicados.**

O problema aqui é o oposto — primitivas que **nunca foram extraídas**. Não há
`Modal` nem `Drawer` como componente; os diálogos são compostos no lugar. Isso
explica os 304 `style={{}}` e boa parte das 1.359 cores: sem primitiva, cada tela
resolve sozinha.

## A ORDEM CORRETA DO TRABALHO

| # | passo | por quê |
|---|---|---|
| 1 | extrair `Modal`, `Drawer`, `Button`, `Field` como primitivas | sem elas, migrar cor é enxugar gelo: a próxima tela nova recria o problema |
| 2 | tokens semânticos por **papel** (`--atlas-success`, `--atlas-danger`, `--atlas-surface-1..3`) | trocar hex por hex-com-outro-nome não resolve nada |
| 3 | migrar por lote, com captura antes/depois nos dois temas | 80 arquivos de uma vez é irrecuperável |
| 4 | portão que reprova hex novo em `.tsx` | sem ele o número volta a subir |

**Nenhum dos quatro foi executado nesta rodada.**
