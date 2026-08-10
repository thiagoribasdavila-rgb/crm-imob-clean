# Fase 028 — Padronização da ação principal

## Resultado

O ATLAS agora possui um contrato único para ações de cabeçalho e para a ação operacional persistente da barra superior. Cada `PageHeader` aceita **no máximo uma ação** e sua prioridade precisa ser declarada como primária ou secundária.

Isso elimina a competição entre links simples, botões primários e botões secundários montados manualmente, sem remover funções ou trocar destinos.

## Linha de base estrutural

Antes da fase, 13 cabeçalhos montavam ações como conteúdo React arbitrário e usavam três apresentações concorrentes:

- link textual simples;
- botão primário;
- botão secundário.

Depois da migração:

| Contexto | Quantidade | Prioridade |
|---|---:|---|
| Criação de cliente | 1 | Primária |
| Aprofundamentos do Command Center | 11 | Secundária |
| Abertura do forecast de vendas | 1 | Secundária |
| Ação operacional persistente da topbar | 1 espaço | Primária e contextual |

Nenhum `actions={<...>}` permanece nos consumidores auditados.

## Contrato compartilhado

O componente `AtlasActionLink` concentra:

- estilo primário ou secundário;
- nome acessível com fallback para o rótulo visível;
- ícone e seta opcionais tratados como decorativos;
- truncamento controlado para preservar o layout;
- metadado de prioridade para inspeção e teste.

O `PageHeader` não recebe mais um bloco arbitrário de ações. Ele recebe somente uma declaração com destino, rótulo, prioridade e informações acessíveis. Esse limite é imposto pelo tipo do componente, e não por convenção informal.

## Hierarquia aplicada

A ação contextual da topbar continua sendo o comando operacional dominante da tela. Os cabeçalhos internos do Command Center são aprofundamentos e, por isso, usam prioridade secundária. A criação de um novo cliente permanece primária porque representa o resultado principal daquela página.

Esse modelo evita transformar todos os links em botões dominantes e mantém a leitura executiva limpa.

## Responsividade e acessibilidade

- Ações de página preservam alvo mínimo de 44 pixels.
- No celular, a ação pode ocupar a largura disponível sem causar estouro.
- Rótulos longos truncam visualmente, mas o nome acessível permanece completo.
- Ícone e seta não são anunciados por leitores de tela.
- A hierarquia não depende apenas de cor: formato, peso, preenchimento e borda diferenciam prioridades.

## Preservação funcional

- Os 13 destinos existentes foram preservados.
- Nenhuma rota foi removida ou criada.
- Nenhum formulário, endpoint ou fluxo paralelo foi criado.
- A política de acesso e os guardas do servidor permanecem obrigatórios.
- Nenhum dado operacional ou segredo foi consultado.

## Limite de evidência

Esta fase comprova consistência estrutural, limite de uma ação por cabeçalho e hierarquia visual explícita. Isso **não comprova aumento de conversão, redução real de cliques ou tempo de conclusão**; esses indicadores dependem de telemetria autorizada em homologação.

O bloqueio de staging da Fase 020 permanece ativo.

## Próxima fase

Fase 029 — **Arquitetura de navegação · Criar carregamento progressivo**.

O próximo avanço deve priorizar conteúdo essencial durante a navegação, reduzir saltos visuais e manter ações disponíveis enquanto módulos secundários são carregados.
