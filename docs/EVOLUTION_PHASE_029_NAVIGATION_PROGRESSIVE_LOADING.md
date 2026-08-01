# Fase 029 — Carregamento progressivo da navegação

## Resultado

O ATLAS agora possui um contrato explícito de carregamento em três prioridades: **contexto essencial**, **resumo operacional** e **detalhes**. A barra lateral, a busca, a ação contextual da topbar e os recursos persistentes do shell continuam disponíveis enquanto o conteúdo da próxima rota é preparado.

O objetivo desta fase não foi simular velocidade. Foi eliminar a sensação de tela vazia, preservar a geometria e comunicar honestamente que o conteúdo está sendo carregado.

## Linha de base estrutural

A auditoria estática encontrou:

- 1 fallback de rota cobrindo o grupo comercial;
- 100 páginas com sinais de carregamento de dados no cliente;
- 76 páginas com algum retorno visual local de carregamento;
- 4 consumidores do componente local compartilhado `LoadingState`.

Essas contagens comprovam cobertura estrutural, não tempo real de resposta. Nenhuma latência, redução de espera ou melhoria de conversão foi inventada.

## Contrato progressivo

| Prioridade | Aparece como | Função |
|---|---|---|
| Essencial | contexto, título, descrição e espaço da ação | Orientar imediatamente onde o usuário está |
| Resumo | quatro indicadores de geometria estável | Preparar a leitura rápida da operação |
| Detalhe | painéis principal e de apoio | Reservar a área de trabalho sem salto visual |

As prioridades ficam declaradas no DOM por `data-loading-priority`. Elas não representam percentual de conclusão e não dependem de temporizador de dados.

## Shell persistente

O fallback está dentro do grupo CRM e abaixo do `AppShell`. Por isso, durante a mudança de página permanecem disponíveis:

- navegação lateral;
- busca global;
- ação comercial contextual da barra superior;
- indicação visual de navegação em andamento;
- dock e comandos persistentes permitidos pelo perfil.

O carregamento de um módulo secundário não substitui a navegação inteira por uma tela bloqueada.

## Estabilidade visual

O fallback reserva alturas mínimas para cada faixa:

- 188 pixels para o contexto essencial;
- 144 pixels para o resumo;
- 420 pixels para os detalhes.

Os skeletons reproduzem a hierarquia do conteúdo final, e não linhas genéricas sem relação com a tela. A entrada visual é curta, progressiva e desativada quando o sistema solicita movimento reduzido.

## Acessibilidade

Existe um único status vivo no fallback da rota, com `aria-busy` e uma mensagem curta. Os skeletons são decorativos e ficam fora da árvore assistiva.

O carregamento local continua marcando sua região como ocupada, mas deixou de abrir vários `role="status"` simultâneos em páginas como o Command Center. Isso reduz anúncios repetidos sem esconder o estado de cada módulo.

## Preservação funcional

- Nenhuma consulta ou estratégia de busca de dados foi alterada.
- Nenhuma rota, destino, formulário ou permissão foi modificado.
- Nenhum dado operacional, usuário ou segredo foi consultado.
- O fallback não mostra percentual, prazo ou progresso fictício.
- O guard de autenticação, o RBAC e o tenant continuam sendo aplicados pelo shell existente.

## Limite de evidência

Esta fase não converteu as consultas atuais executadas no cliente em Server Components ou `Suspense` de dados. Essa mudança exigiria uma revisão separada do contrato de dados, cache, autenticação e isolamento por tenant.

Portanto, a entrega comprova prioridade visual, persistência do shell, retorno local e proteção contra saltos. Tempo percebido real depende da telemetria autorizada em homologação. O bloqueio de staging da Fase 020 permanece ativo.

## Próxima fase

Fase 030 — **Arquitetura de navegação · Criar estado vazio útil**.

O próximo avanço deve garantir que cada ausência de dados explique o que aconteceu e ofereça uma ação segura, sem confundir falta de conteúdo com falha do sistema.
