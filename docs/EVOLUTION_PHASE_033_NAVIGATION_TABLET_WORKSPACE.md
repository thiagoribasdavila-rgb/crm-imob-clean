# Fase 033 — Navegação e workspace adaptativos no tablet

## Resultado

O ATLAS passou a tratar tablets e telas intermediárias como uma faixa própria até 1.179 pixels. Nessa faixa, a sidebar deixa de reservar espaço continuamente e abre como painel sob demanda; o dock inferior permanece disponível e o conteúdo comercial recupera a largura central.

Esse comportamento também cobre tablets grandes em modo paisagem, que antes entravam no layout de desktop a partir de 1.024 pixels e recebiam uma sidebar fixa de 264 pixels.

## Evolução sobre a Fase 013

A Fase 013 criou a primeira base exclusiva de tablet entre 768 e 1.023 pixels, com sidebar sobreposta de até 320 pixels e dock central de até 560 pixels. Esta fase preserva esses fundamentos e amplia o contrato até 1.179 pixels, alinhando a transição com o início real do desktop amplo definido na Fase 032.

O novo contrato usa tokens compartilhados:

- `--atlas-tablet-gutter`, com respiro fluido entre 18 e 28 pixels;
- `--atlas-tablet-dock-max`, limitado a 680 pixels;
- `atlas-tablet-workspace`, como container do conteúdo intermediário.

## Navegação sem perda de contexto

Entre 768 e 1.179 pixels:

- o menu lateral abre por comando explícito, com backdrop, tecla Escape, bloqueio do fundo e ciclo de foco já governados pela sidebar;
- o dock inferior mantém quatro destinos autorizados pelo perfil e a busca global;
- a topbar preserva contexto atual, ação principal, busca, notificações, perfil e saída;
- o nome duplicado do usuário e o texto da ação rápida são ocultados, mas os nomes acessíveis permanecem;
- o conteúdo não recebe margem de sidebar e continua limitado pelo canvas do produto.

Na faixa mais estreita, entre 768 e 899 pixels, o atalho visual de teclado da busca é ocultado e os espaços da topbar são reduzidos. A busca continua sendo um botão nativo com o mesmo nome acessível e a mesma função.

## Isolamento responsivo

- Celulares até 767 pixels mantêm integralmente o contrato touch-first.
- Tablets e telas intermediárias usam o workspace sobreposto entre 768 e 1.179 pixels.
- Desktop amplo começa em 1.180 pixels, onde permanecem a sidebar fixa e o seletor de densidade da Fase 032.
- Não foi adicionado JavaScript de orientação ou detecção de dispositivo.

## Segurança, acessibilidade e verdade

Não houve alteração de dados comerciais, consultas, banco, schema, rotas, RBAC, tenant ou segredos. Os destinos do dock continuam derivados da identidade autorizada e o item atual continua exposto por `aria-current`.

A ampliação da faixa responsiva é evidência estrutural. Ganho real de produtividade, redução de rolagem ou preferência dos usuários ainda dependem de telemetria e homologação por perfil. O bloqueio da Fase 020 permanece ativo.

## Revisão React

- Nenhum estado, efeito, listener ou requisição foi adicionado.
- O shell apenas publica um contrato declarativo de layout.
- Os controles existentes continuam semânticos e operáveis por teclado.
- O drawer reutiliza o mesmo foco controlado, fechamento por Escape e restauração de foco.

## Próxima fase

Fase 034 — **Arquitetura de navegação · Otimizar mobile**.

O próximo avanço deve revisar o uso com uma mão, a prioridade do dock e a compactação do topo em celulares, preservando ações comerciais e acessibilidade.
