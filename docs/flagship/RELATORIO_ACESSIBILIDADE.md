# RELATÓRIO DE ACESSIBILIDADE — WCAG 2.2 AA

**2026-07-31.** Sem ferramenta automatizada instalada (`axe-core` ausente do
projeto). O que segue foi medido por inspeção do DOM renderizado e por varredura
do código-fonte.

## O QUE PASSA, MEDIDO

| critério | resultado | como |
|---|---|---|
| `<img>` sem `alt` | **0** | varredura no código |
| botões sem rótulo acessível | **0** | DOM renderizado, `/pipeline` |
| interativos fora da ordem de foco (`tabIndex -1`) | **0** | DOM renderizado |
| atributos `aria-*` | **786** | varredura no código |
| `focus-visible` declarado | **96** ocorrências | varredura no código |
| informação só por cor | **não encontrada** nos painéis auditados | inspeção |

## O QUE REPROVA

| critério WCAG 2.2 AA | resultado | impacto |
|---|---|---|
| **2.5.8 Target Size (Minimum)** | **104 alvos < 24 × 24 px** | reprovado |
| **2.3.3 Animation from Interactions** | `prefers-reduced-motion` em apenas **5 arquivos** | parcial |

## O QUE NÃO FOI VERIFICADO — e não vou dizer que foi

contraste de cor calculado par a par · navegação completa por teclado numa
jornada inteira · focus trap em modais · fechamento por Escape · associação
`aria-describedby` entre erro e campo · landmarks e hierarquia de headings ·
leitor de tela real (VoiceOver/NVDA).

**Todos exigem ou ferramenta automatizada ou uma pessoa.** Nenhum foi executado.

## COMO FECHAR

```bash
npm i -D @axe-core/playwright @playwright/test
npx playwright install chromium webkit firefox
```

Com isso: axe nas 10 rotas principais, contraste calculado, navegação por
teclado roteirizada e os 3 engines. É a única forma de esta seção sair de
"parcialmente medida".
