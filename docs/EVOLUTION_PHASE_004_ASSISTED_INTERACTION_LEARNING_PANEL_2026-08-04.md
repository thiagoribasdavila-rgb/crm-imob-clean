# Fase 4 — painel de aprendizado supervisionado

## Objetivo

Dar à gestão uma leitura simples do uso da captura assistida sem transformar a IA em automação de atendimento e sem expor conteúdo de conversas.

## Entrega

- Painel no Centro de Decisão para diretoria, superintendência e administrador.
- Reaproveitamento de `GET /api/v1/analytics/assisted-interaction?days=30`.
- Indicadores agregados: rascunhos, confirmações humanas, retorno opcional do corretor e tempo até a próxima ação registrada.
- Estado vazio útil enquanto ainda não há amostra.
- Perfil sem permissão de gestão não recebe o painel nem uma mensagem de erro.

## Proteções

- Não cria tabelas nem migrations.
- Não altera leads, eventos comerciais, tarefas ou permissões.
- Não mostra anotação original, resumo de atendimento, telefone ou identidade da lead.
- Não dispara mensagem, ligação, alteração de etapa ou qualquer ação externa.
- O retorno do corretor é utilidade percebida e não evidência de venda ou de qualidade do atendimento.

## Validação

1. Entrar como gestor e abrir `/decision-center`.
2. Confirmar que o painel mostra leitura agregada de 30 dias ou o estado sem amostra.
3. Entrar como corretor e confirmar que a resposta `403` não gera erro visual no Centro de Decisão.
4. Confirmar uma captura no Lead 360, registrar avaliação opcional e recarregar o painel como gestor.
