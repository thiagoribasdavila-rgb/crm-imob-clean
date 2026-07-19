# Fase 034 — Navegação móvel ao alcance do polegar

## Resultado

O dock móvel do ATLAS passou a concentrar a próxima ação comercial no centro da navegação, entre os quatro destinos operacionais governados. Em vez de exigir que o corretor alcance o topo da tela para cadastrar ou avançar uma rotina, a ação contextual permanece disponível na zona inferior.

O dock continua com cinco posições: dois destinos, uma ação contextual e mais dois destinos. Nenhuma rota foi adicionada e o catálogo autorizado por perfil continua sendo a fonte da navegação.

## Ação contextual sem duplicidade

A ação central usa a mesma resolução governada que já alimenta a topbar:

- no fluxo padrão, oferece **Novo lead**;
- em páginas com próximo passo conhecido, apresenta a ação daquela rotina;
- quando a ação contextual repetiria um dos quatro destinos do dock, volta para **Novo lead**;
- o nome completo permanece em `aria-label` e `title`, mesmo quando o rótulo visual precisa ser truncado.

No celular, a versão duplicada dessa ação sai da topbar. Busca global, menu, seção atual, notificações quando há espaço e perfil continuam preservados.

## Touch-first evoluído para thumb-first

A Fase 014 estabeleceu campos com 16 pixels, alvos mínimos de 44 pixels e proteção para aparelhos estreitos. Esta fase preserva essa base e eleva o alvo do dock para 50 pixels e o alvo central para 58 pixels.

O novo contrato também:

- usa `--atlas-mobile-edge` para manter margens fluidas entre 10 e 14 pixels;
- reserva 104 pixels abaixo do conteúdo, incluindo a área segura do aparelho;
- aplica `touch-action: manipulation` às ações frequentes;
- destaca a ação central sem depender apenas da cor;
- mantém o único botão de cabeçalho em largura integral quando ele é a única ação da página.

## Navegação e acessibilidade

O dock continua sendo um elemento `nav`. Os quatro destinos são links nativos e o destino atual continua marcado com `aria-current="page"`. A ação central também é um link nativo com nome contextual completo.

A busca global permanece na topbar móvel, evitando retirar capacidade ao substituir a antiga quinta posição do dock. O menu lateral preserva foco, Escape e restauração de foco; o perfil continua acessível no topo.

## Segurança e verdade

Não houve leitura ou escrita de dados comerciais, banco, schema, segredos, usuários, permissões ou tenant. O contrato reutiliza somente destinos já autorizados e não cria um fluxo comercial paralelo.

Colocar a ação na zona inferior é uma melhoria estrutural de alcance. Taxa real de uso com uma mão, redução de tempo ou impacto em conversão dependem de telemetria e homologação por perfil. O bloqueio da Fase 020 permanece ativo.

## Revisão React

- A ação é derivada do caminho e da identidade já disponíveis.
- Nenhum estado, efeito, listener ou requisição foi adicionado.
- A lista mantém chaves estáveis pelo destino.
- Os elementos interativos continuam semânticos e operáveis por teclado.
- O fallback evita duplicar uma rota primária no mesmo dock.

## Próxima fase

Fase 035 — **Arquitetura de navegação · Melhorar dashboard**.

O próximo avanço deve transformar o Command Center em uma entrada mais direta para decisão e execução, preservando métricas reais e o escopo de cada perfil.
