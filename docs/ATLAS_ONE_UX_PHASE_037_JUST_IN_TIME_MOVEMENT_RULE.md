# ATLAS ONE — Fase 37: regra de movimento no momento certo

## Objetivo

Remover instruções permanentes do Kanban e apresentar a regra de avanço somente quando o usuário demonstrar intenção de mover uma oportunidade.

## Entrega

- foco no card revela os destinos anterior e seguinte compatíveis com a posição atual;
- início do arraste troca a orientação pela prévia segura de destino já existente;
- primeira etapa e decisões terminais recebem orientação específica;
- ao sair do card ou concluir o movimento, a orientação desaparece;
- instruções invisíveis para leitores de tela permanecem associadas ao quadro e aos cards;
- o rodapé visual redundante foi removido.

## Segurança preservada

API, confirmação terminal, rollback, histórico, desfazer, RLS e dados não foram modificados.

## Validação

Executar `npm run ux:phase-037:check`, seguido de typecheck, lint e testes completos.

## Próxima fase

Compactar colunas vazias sem impedir que elas recebam movimentações nem ocultar a estrutura do funil.
