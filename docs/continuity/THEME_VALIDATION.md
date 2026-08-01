# THEME_VALIDATION — tema claro e escuro após a unificação

Data: 2026-07-24 · Escopo: unidade "evolução do layout claro" (`0e963a82`) + correção do
contrato CC23 (`916c609a`).

## Método

A validação **não** foi feita "olhando se a classe CSS parece correta". Foram três provas:

1. **Contraste medido** (WCAG 2.1, fórmula de luminância relativa) sobre os pares reais de
   token do produto — 27 pares, claro e escuro. Script: `scratchpad/contrast.mjs`.
2. **Gates automatizados** do próprio repositório: `light-layout:check` (fundação do claro)
   e `cc23:check` (30 controles da camada de design), ambos executados após cada alteração.
3. **Análise de escopo do seletor** para provar não-regressão do escuro (abaixo).

Limite honesto: **não houve captura de tela**. O ambiente não tem navegador headless
instalado e a instrução desta etapa proíbe instalar dependências sem necessidade comprovada.
As evidências abaixo são numéricas e estáticas, não perceptuais. Ver "Pendente" no fim.

## Resultado do contraste — 27 pares, 0 reprovações AA

### Tema claro

| elemento | fg | bg | razão | WCAG |
|---|---|---|---|---|
| título (h2/h3) sobre canvas | `#0b1220` | `#f6f8fc` | 17,61:1 | AAA |
| texto normal sobre canvas | `#0b1220` | `#f6f8fc` | 17,61:1 | AAA |
| texto normal sobre card | `#0b1220` | `#ffffff` | 18,72:1 | AAA |
| **texto forte `<strong>` sobre card** | `#0b1220` | `#ffffff` | **18,72:1** | **AAA** |
| texto secundário sobre canvas | `#44526b` | `#f6f8fc` | 7,41:1 | AAA |
| texto terciário sobre canvas | `#5f6d81` | `#f6f8fc` | 4,95:1 | AA |
| texto terciário sobre superfície sutil | `#5f6d81` | `#eef2f8` | 4,68:1 | AA |
| link / acento sobre card | `#0b63c5` | `#ffffff` | 5,82:1 | AA |
| acento forte (estado selecionado) | `#084a95` | `#ffffff` | 8,66:1 | AAA |
| rodapé (terciário) sobre canvas | `#5f6d81` | `#f6f8fc` | 4,95:1 | AA |
| readiness — número (`dd`) | `#0b1220` | `#ffffff` | 18,72:1 | AAA |
| readiness — rótulo (`dt`) | `#5f6d81` | `#ffffff` | 5,26:1 | AA |
| readiness — detalhe (`p`) | `#5f6d81` | `#ffffff` | 5,26:1 | AA |
| temperatura quente | `#be123c` | `#ffffff` | 6,29:1 | AA |
| temperatura morno | `#92400e` | `#ffffff` | 7,09:1 | AAA |
| temperatura frio | `#075985` | `#ffffff` | 7,56:1 | AAA |

O item "textos `<strong>` quase invisíveis no tema claro", citado no registro da sessão
interrompida, está **resolvido e medido**: 18,72:1 (AAA). O `<strong>` herda
`--atlas-text-primary`, o mesmo token do texto normal — não existe regra que o clareie.

### Tema escuro (prova de não-regressão)

| elemento | fg | bg | razão | WCAG |
|---|---|---|---|---|
| título / texto normal sobre fundo | `#f8fafc` | `#050812` | 19,12:1 | AAA |
| texto normal e `<strong>` sobre card | `#f8fafc` | `#0a1020` | 18,12:1 | AAA |
| texto secundário sobre fundo | `#8ea0b8` | `#050812` | 7,50:1 | AAA |
| texto secundário sobre card | `#8ea0b8` | `#0a1020` | 7,10:1 | AAA |
| link / acento | `#38bdf8` | `#050812` | 9,34:1 | AAA |
| readiness — oportunidade | `#38bdf8` | `#0a1020` | 8,85:1 | AAA |
| readiness — limpo (success) | `#34d399` | `#0a1020` | 9,86:1 | AAA |
| readiness — atenção (warning) | `#fbbf24` | `#0a1020` | 11,35:1 | AAA |
| readiness — crítico (danger) | `#fb7185` | `#0a1020` | 7,04:1 | AAA |

## Por que o tema escuro não pode ter regredido (argumento estrutural)

1. **Todas** as regras adicionadas nesta unidade estão sob o seletor
   `:root[data-theme="light"]`, que só casa quando o `<html>` carrega `data-theme="light"`.
   No escuro (padrão, sem o atributo) essas regras simplesmente não se aplicam.
2. As únicas regras adicionadas **fora** do escopo claro são classes novas
   (`.atlas-kanban-readiness`, `.atlas-pipeline-title`, `.atlas-pipeline-subtitle`,
   `.atlas-kanban-search`), que não existiam antes — não sobrescrevem nada.
3. A única alteração em token global foi `--readiness-accent: var(--primary)` no `:root`.
   Ela é **comprovadamente neutra**: no escuro `--primary` é `#38bdf8`, exatamente o valor
   do fallback literal que existia antes (`var(--readiness-accent, #38bdf8)`); no claro
   `--primary` é `#0b63c5`, exatamente o outro fallback removido (`var(--readiness-accent,
   #0b63c5)`). O valor computado é idêntico nos dois temas — mudou a origem, não o resultado.

## Gates automatizados executados

| gate | antes da unidade | depois | observação |
|---|---|---|---|
| `cc23:check` | 30/30 | **30/30** | caiu para 27/30 na primeira versão da entrega; corrigido em `916c609a` |
| `light-layout:check` | não existia | **✅** | criado por esta unidade (6 grupos de asserção) |
| `npm test` | 53/53 | **62/62** | +9 de contratos importados do pacote Atlas One |
| `tsc --noEmit` | 0 | **0** | |
| `eslint --max-warnings=0` | 0 | **0** | |
| `npm run build` | exit 0 | **exit 0** | build de produção completo |

## Tamanhos

Regras responsivas verificadas por leitura do CSS (não por captura):
`.atlas-kanban-readiness` colapsa para uma coluna e a lista de sinais vai de 4 para 2 colunas
sob o breakpoint móvel já existente no arquivo. Desktop e tablet usam o layout de 2 colunas
(`minmax(0,1fr) auto`). **Não validado perceptualmente** — ver pendências.

## Pendente (honesto)

- [ ] Captura de tela antes/depois nos dois temas (desktop, tablet, mobile) — exige navegador
      headless, não instalado. É a lacuna real desta validação.
- [ ] Validação visual do tema claro em Command Center, Leads, Projetos e Copilot — o claro
      hoje cobre shell interno, páginas públicas e pipeline; as demais telas ainda não foram
      convertidas (registrado em `docs/LIGHT_LAYOUT_EVOLUTION.md`).
- [ ] Estados `hover`/`selected` medidos com o olho humano; hoje só o par de cor foi medido.
