# Atlas One V3000 — Fase 2: fundação visual canônica

Data: 10/08/2026

## Objetivo

Definir a fonte única do futuro template V3000 sem alterar autenticação, dados,
rotas, APIs, permissões ou comportamento dos módulos em operação. Esta fase
organiza o que já existe e estabelece limites objetivos para as próximas
evoluções visuais.

## Resultado executivo

O projeto **já possui uma fundação visual adequada** em
`styles/atlas-tokens.css`. Ela deve ser preservada e evoluída, não substituída.
O maior risco atual não é falta de tokens: é a existência de estilos locais e
valores hardcoded concentrados em `app/globals.css`, além de uma segunda
linguagem experimental no Design Lab.

A base canônica V3000 fica definida assim:

| Camada | Fonte canônica | Regra |
| --- | --- | --- |
| Tokens semânticos | `styles/atlas-tokens.css` | Única fonte de verdade |
| Compatibilidade legada | `app/globals.css` | Pode consumir tokens; não deve criar nova paleta global |
| Shell operacional | `components/atlas/app-shell.tsx` | Preservar contratos e comportamento |
| Navegação | `components/atlas/sidebar.tsx` + `lib/atlas/navigation.ts` | Preservar RBAC e escopo por papel |
| Conceitos visuais | `components/design-lab/command-center-concepts.module.css` | Referência isolada; não é fonte de produção |

## Inventário factual

### Tokens já consolidados

- 6 camadas de superfície: canvas, navegação, superfície, superfície sutil,
  elevada e interativa.
- 4 níveis de borda/overlay.
- 4 níveis de texto: primário, secundário, terciário e desabilitado.
- 1 família de ação: azul Atlas, com hover, pressed, soft e faint.
- 3 estados operacionais: sucesso, atenção e bloqueio.
- 8 passos de espaçamento.
- 6 níveis tipográficos, além de escala fluida para títulos.
- 6 raios, de controle compacto a pill.
- 4 sombras semânticas.
- 2 densidades operacionais: confortável e compacta.
- dimensões compartilhadas de sidebar, topbar, conteúdo e alvos de toque.
- movimento com duração rápida e padrão, com suporte a
  `prefers-reduced-motion`.

### Dívida observada

- `app/globals.css` concentra aproximadamente 2.559 ocorrências de cores
  literais. Grande parte pertence a módulos específicos e não deve ser
  substituída em massa.
- os tokens `--atlas-*` são consumidos diretamente apenas por
  `styles/atlas-tokens.css` e `app/globals.css`; os componentes recebem a
  semântica por classes globais. Isso torna `globals.css` um ponto crítico.
- existem acentos locais como `--decision-accent`, `--pipeline-os-accent`,
  `--stage-accent` e similares. Eles podem continuar como variáveis de escopo,
  mas precisam herdar uma função semântica, não criar uma nova marca.
- o Design Lab possui 164 cores literais e deve continuar isolado até que um
  conceito seja aprovado e convertido para os tokens de produção.
- componentes e páginas pontuais ainda usam cores literais, especialmente
  autenticação, materiais, distribuição, dashboard e campanhas.

## Contrato visual V3000

### Cor

- azul: ação, foco, navegação ativa e informação acionável;
- verde: sucesso confirmado ou saúde operacional;
- amarelo: atenção, prazo ou risco recuperável;
- vermelho: bloqueio, falha ou risco crítico;
- neutros: estrutura, conteúdo, filtros e informação secundária;
- violeta legado: compatibilidade temporária, sem novo significado.

Cor nunca deve ser usada sozinha para comunicar estado. Texto, ícone ou rótulo
deve acompanhar o sinal.

### Tipografia

- Geist Sans permanece como fonte principal;
- título de página: `--atlas-font-size-3xl`, somente uma vez por tela;
- título de seção: `--atlas-font-size-xl` ou `--atlas-font-size-lg`;
- corpo operacional: `--atlas-font-size-md`;
- tabela, metadado e label: `--atlas-font-size-sm` ou `xs`;
- valores principais usam peso e contraste, não tamanho excessivo;
- títulos longos devem respeitar `--atlas-content-measure`.

### Espaçamento e densidade

- páginas usam `--atlas-density-page-gap`;
- seções usam `--atlas-density-section-gap`;
- cards usam `--atlas-density-card-padding`;
- tabelas usam os tokens block/inline;
- controles mantêm 40 px no desktop e 44 px em superfícies de toque;
- o modo compacto altera tokens, nunca duplica componentes.

### Superfícies e elevação

- superfície base: leitura e agrupamento;
- superfície elevada: seleção, foco ou informação ativa;
- shadow de card: somente para hierarquia real;
- shadow de overlay: somente modal, drawer, command palette ou popover;
- gradientes e glow não podem competir com métricas, alertas ou CTA.

### Movimento

- feedback de interação: até 120 ms;
- transição de estado: 180 ms;
- animações contínuas somente quando indicam processamento real;
- toda animação respeita redução de movimento;
- nenhum efeito pode atrasar navegação ou ação comercial.

## O que fica explicitamente preservado

- tema escuro operacional atual;
- identidade Atlas One;
- shell, sidebar, topbar e mobile dock atuais;
- densidade compacta e confortável;
- estados semânticos existentes;
- classes legadas necessárias para páginas em produção;
- contratos de autenticação, sessão, tenant, RBAC e RLS;
- comportamento do Kanban, relatórios e Command Center.

## O que não entra no template V3000 ainda

- estilos do Design Lab sem aprovação funcional;
- novas paletas por módulo;
- emojis decorativos sem função;
- gradientes multicoloridos como hierarquia;
- substituição em massa de CSS literal;
- tema claro antes de existir prova de contraste e paridade completa;
- componentes duplicados apenas para variar aparência.

## Estratégia segura de migração

1. Congelar `styles/atlas-tokens.css` como fonte de verdade.
2. Classificar classes globais por superfície: shell, navegação, página,
   métrica, trabalho, decisão, tabela e feedback.
3. Migrar uma família por fase, começando por primitives sem estado.
4. Preservar snapshots e testes contratuais de cada módulo tocado.
5. Não converter cor de negócio sem confirmar seu significado.
6. Só remover aliases depois de nenhuma rota ativa depender deles.

## Critérios de aceite da Fase 2

- [x] fonte canônica de tokens identificada;
- [x] paleta semântica definida;
- [x] tipografia, espaçamento, raios, sombras e movimento documentados;
- [x] densidade desktop/mobile preservada;
- [x] pontos de dívida quantificados;
- [x] Design Lab separado da produção;
- [x] nenhuma rota, dado, API ou permissão alterada;
- [x] nenhuma substituição visual insegura executada.

## Próxima fase recomendada

**Fase 3 — primitives canônicos do V3000.** Mapear os componentes de base já
existentes (botão, input, select, badge, card, métrica, tabela, loading, empty e
error state), eliminar apenas duplicidades comprovadas e definir qual primitive
cada tela nova deverá reutilizar.
