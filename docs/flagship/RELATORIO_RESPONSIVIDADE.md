# RELATÓRIO DE RESPONSIVIDADE — MEDIDO

**2026-07-31.** Medição por inspeção do DOM renderizado no navegador, contra
build de **produção**, autenticado.

## O QUE FOI TESTADO — e o que não foi

| viewport | testado | resultado |
|---|:---:|---|
| 360 × 800 | ✅ | sem overflow horizontal (excesso **0 px**) |
| 768 × 1024 | ✅ | sem overflow horizontal (excesso **0 px**) |
| 1280 × 800 | ✅ | sem overflow horizontal |
| 390 × 844 · 430 × 932 · 1024 × 768 · 1440 × 900 · 1920 × 1080 | ❌ | **não testados** |

| engine | testado |
|---|:---:|
| Chromium | ✅ |
| WebKit · Firefox | ❌ **não testados** — Playwright não está instalado neste repositório |

**Rota medida:** `/pipeline` — escolhida por ser a mais densa (153.097 caracteres
de texto, 3.142 elementos interativos numa tela).

## O RESULTADO PRINCIPAL

**Nenhum overflow horizontal em nenhum dos três viewports testados.** `scrollWidth`
é exatamente igual a `clientWidth`. A barra lateral sai da tela para a esquerda
em 360 px — comportamento correto de menu fora de tela, não vazamento.

Os elementos listados como "fora da caixa" em 360 px são todos deliberados:
`atlas-sidebar` e seus filhos (menu fechado) e um `atlas-ambient-orb`
(decoração posicionada). Nenhum conteúdo operacional ficou inacessível.

## O ACHADO QUE REPROVA

| medida | 360 × 800 | 768 × 1024 |
|---|---:|---:|
| elementos interativos | 3.142 | 3.142 |
| **alvos menores que 24 × 24 px** | **104** | **104** |
| botões sem rótulo acessível | 0 | 0 |
| interativos fora da ordem de foco | 0 | 0 |

**104 alvos de toque abaixo de 24 × 24 px** reprovam o critério WCAG 2.2 AA
*Target Size (Minimum)*. No celular, cada um deles é um erro de toque esperando
acontecer — e é o corretor em campo, com uma mão, que paga.

O número **não muda entre 360 e 768**, o que diz que não é um problema de
breakpoint: são os mesmos controles pequenos em qualquer tamanho.

## O QUE NÃO FOI VERIFICADO

teclado virtual encobrindo ações · gestos de toque · rotação de tela ·
preservação de rascunho ao trocar de tela · leitor de tela real.

## CORREÇÃO PROPOSTA

Elevar a área de toque mínima para 24 px (preferencialmente 44 px em mobile) via
token do Design System, e não arquivo a arquivo — 104 ocorrências corrigidas à
mão voltam na próxima tela nova.
