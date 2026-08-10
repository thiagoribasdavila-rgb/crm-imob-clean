# Atlas One — Fase 59: medição antes × depois

## Resultado

O shell operacional agora registra, no `atlas_events` já existente, duração, cliques, erros de interface, engajamento de leitura, conclusão de tarefa e qualidade humana da decisão. Nenhum texto digitado, nome, telefone ou e-mail entra no evento.

## Comparação responsável

- Sessões sem a versão `atlas-v30-phase-59` formam a linha de base.
- Sessões com a versão formam o período posterior.
- A comparação exige ao menos 10 sessões em cada coorte.
- Sem amostra suficiente, a tela informa que ainda está medindo.
- A relação observada não é apresentada como causalidade.
- “Leitura” é um proxy conservador de tempo (8 segundos) e rolagem (25%), não compreensão.
- “Qualidade” é nota de 1 a 5 registrada por uma pessoa ao fechar o resultado da decisão.

## Segurança e escopo

O painel é restrito à gestão, isolado por `organization_id`, não cria tabela ou migration e não altera dados comerciais. Falha de telemetria nunca bloqueia o trabalho.

## Próxima etapa

A Fase 60 deverá usar evidência suficiente como parte do gate humano de liberação do redesign, com rollback e aceite explícito do Diretor.
