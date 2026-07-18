# Fase 032 — Espaço de trabalho adaptativo no desktop

## Resultado

O ATLAS passou a oferecer dois níveis de densidade em monitores amplos. O modo **Compacto** prioriza mais contexto comercial por tela; o modo **Confortável** preserva o espaçamento já validado na Fase 012. A escolha fica na topbar e é lembrada somente no navegador atual.

## Evolução sobre a Fase 012

A Fase 012 ampliou o canvas até 1.728 pixels e alinhou topbar, sidebar e conteúdo. Ela estabeleceu uma única densidade. Esta fase mantém essa largura e adiciona uma escolha controlada para telas a partir de 1.180 pixels, sem duplicar páginas e sem esconder funções.

No modo compacto, seis superfícies compartilhadas recebem espaçamento mais eficiente:

- área principal;
- cabeçalho de página;
- cabeçalho de card;
- indicadores;
- tabelas;
- estados vazios ou recuperáveis.

Como o ajuste acontece no shell e no design system, páginas atuais e futuras herdam o mesmo comportamento sem regras individuais.

## Controle explícito

O botão nativo da topbar informa o estado com `aria-pressed` e um nome acessível que descreve a próxima opção. A preferência usa a chave local `atlas:desktop-density`; ela não vai para o banco, não altera o perfil e não cruza organizações.

O padrão inicial é Compacto. Quem preferir mais respiro pode alternar para Confortável, que mantém as dimensões anteriores.

## Limites responsivos

- O seletor aparece somente em desktop amplo, a partir de 1.180 pixels.
- As regras de tablet e celular não foram alteradas.
- O conteúdo continua limitado a 1.728 pixels.
- A barra de rolagem reserva sua largura para evitar pequenos deslocamentos laterais.
- Nenhum conteúdo é removido ou reduzido a um ícone sem nome acessível.

## Segurança e verdade

Não houve leitura ou escrita de dados comerciais, banco, segredo, permissão, rota ou configuração de tenant. A redução de rolagem é uma intenção estrutural; ganho de produtividade e quantidade real de rolagem ainda dependem de telemetria e homologação por perfil. O bloqueio da Fase 020 permanece ativo.

## Revisão React

- O estado possui tipo fechado: `compact | comfortable`.
- A preferência é lida uma vez na montagem e validada antes do uso.
- A troca calcula o próximo modo dentro do evento e mantém o atualizador de estado livre de efeitos colaterais.
- Não foram criados efeitos dependentes de rota, listeners ou requisições adicionais.
- O controle permanece um botão semântico e operável por teclado.

## Próxima fase

Fase 033 — **Arquitetura de navegação · Otimizar tablet**.

O próximo avanço deve reorganizar o espaço intermediário sem simplesmente encolher a interface de desktop e sem degradar a experiência móvel.
