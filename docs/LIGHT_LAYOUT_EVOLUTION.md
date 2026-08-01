# ATLAS AI OS — evolução do layout claro

## O que já existia

O V3 já possuía uma base de tema claro por opt-in:

- `components/atlas/theme-toggle.tsx` alterna e salva `atlas:theme`;
- `app/layout.tsx` aplica `data-theme` antes do primeiro render para evitar piscada visual;
- `app/globals.css` possui tokens claros em `:root[data-theme="light"]`.

## O que foi continuado

A evolução foi concentrada no shell interno e no Kanban real do CRM:

- cobertura clara para sidebar, topbar, busca global e superfícies do app;
- camada clara dedicada para o pipeline em `app/(crm)/pipeline/page.tsx`;
- novo bloco “Kanban de execução”, resumindo SLA, leads sem ação, quentes e visíveis;
- microcopy mais operacional: menos painel decorativo, mais orientação de ação;
- contraste claro/escuro preservado sem remover a identidade premium do ATLAS.

## Por que isso importa para a operação

O corretor e o gerente precisam entender rapidamente:

- qual oportunidade atacar agora;
- onde há SLA vencido;
- quais leads estão sem próxima ação;
- quais leads estão quentes;
- se o pipeline está limpo ou exige intervenção.

Essa fundação reduz ruído visual e prepara o Kanban para virar uma tela de execução diária, não só um quadro de etapas.

## Validação adicionada

Foi criado o check:

```bash
npm run light-layout:check
```

Ele garante que:

- tema claro continua presente;
- shell interno está coberto no tema claro;
- Kanban usa classes próprias de evolução;
- toggle e pre-paint script continuam conectados;
- pipeline real mantém o bloco de prontidão.

## Próximas evoluções recomendadas

1. Transformar os cards do Kanban em cartões compactos por intenção: ligar, WhatsApp, visita, proposta.
2. Criar modo “corretor em campo” com ações grandes no mobile.
3. Reduzir texto repetido e deixar cada coluna com uma decisão principal.
4. Criar barra de “próxima melhor ação” fixa no topo do pipeline.
5. Validar visualmente o tema claro em Command Center, Leads, Projetos e Copilot.
