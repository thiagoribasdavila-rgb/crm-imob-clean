# ATLAS AI OS — Fase 86/3000

## Objetivo

Prevenir novas lacunas de projeto e origem no momento em que o corretor confirma um resultado, tornando o contexto visível antes do salvamento sem inventar informação nem bloquear a rotina.

## Problema resolvido

O Atlas já preservava projeto e origem no evento histórico, mas essa informação era capturada apenas no servidor depois da confirmação. O corretor não conseguia verificar antecipadamente quais dimensões entrariam na memória e uma alteração simultânea do cadastro poderia tornar a revisão visual diferente do dado efetivamente salvo.

## Alterações realizadas

- Criado contrato pequeno e tipado de prévia contextual com projeto, origem, dimensões ausentes, estado e política explícita.
- A fila diária reaproveita os dados de lead já carregados; não foi criado novo fetch.
- Tarefas recém-concluídas e lacunas antigas de resultado levam a mesma prévia ao formulário governado.
- O Copilot mostra projeto e origem antes do seletor de resultado e da confirmação humana existente.
- Ausências aparecem como `Não informado`, com explicação e atalho para a Lead 360.
- O botão de registro continua disponível quando o contexto está incompleto. O Atlas não completa valores automaticamente.
- A confirmação passa a declarar que resultado e contexto foram revisados.
- A API recebe a prévia revisada, busca o cadastro no servidor e compara os dois valores.
- Se o cadastro mudou durante a revisão, nada é salvo; a resposta devolve o contexto atual e pede nova confirmação.
- O snapshot histórico usa somente os valores novamente confirmados no servidor no instante do salvamento.

## Impacto operacional

O corretor sabe exatamente qual projeto e origem acompanharão o resultado observado, corrige o cadastro quando isso for útil e não perde o registro quando a informação ainda não existe. A gestão reduz novas lacunas sem criar um formulário obrigatório adicional ou uma fila paralela.

## Segurança e governança

- Sessão, organização, RLS, escopo da lead, idempotência e confirmação humana permanecem obrigatórios.
- O cliente nunca escolhe silenciosamente o valor persistido: o servidor relê e compara o contexto.
- Contexto alterado exige reconfirmação, evitando condição de corrida.
- Projeto ou origem ausente não recebe inferência, sugestão automática ou preenchimento por IA.
- Nenhum telefone, e-mail ou dado de contato foi adicionado à prévia.
- Nenhum modelo generativo, score, ranking, previsão, mensagem ou automação foi acionado.

## Compatibilidade

- Usa as colunas legadas `leads.project` e `leads.source`, já presentes no contrato vivo.
- Reaproveita a mesma consulta da fila diária e o mesmo formulário de resultado.
- Resultados antigos continuam imutáveis; a mudança protege somente novos registros.
- Não há migration, tabela nova, dependência nova ou configuração adicional na Hostinger.

## Risco identificado

Projeto ou origem podem mudar enquanto o formulário está aberto. O Atlas não grava o valor antigo nem aceita silenciosamente o novo: atualiza a prévia, desmarca a confirmação e solicita que o usuário revise novamente.

## Checklist de validação

- [x] Projeto e origem aparecem antes do salvamento.
- [x] Ausências são exibidas separadamente.
- [x] Contexto incompleto não desabilita o registro.
- [x] Não existe preenchimento automático.
- [x] A Lead 360 continua sendo o ponto de correção manual.
- [x] A confirmação humana abrange resultado e contexto.
- [x] Divergência entre prévia e servidor impede snapshot incorreto.
- [x] O servidor devolve a prévia atualizada para nova revisão.
- [x] O snapshot histórico usa o contexto confirmado no servidor.
- [x] Build e ZIP permanecem reservados ao gate de release.

## Próxima etapa recomendada

Fase 87 — tornar a correção de projeto e origem mais rápida dentro da Lead 360, com edição manual governada, validação e auditoria, sem reescrever fatos históricos.
