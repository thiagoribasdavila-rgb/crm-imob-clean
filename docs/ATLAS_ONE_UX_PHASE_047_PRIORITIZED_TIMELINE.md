# Atlas One — Fase 47: linha do tempo priorizada do Lead 360

## Objetivo

Reduzir a leitura simultânea da rotina do lead sem esconder atrasos, próximos compromissos ou o contexto recente necessário para decidir.

## Alterações

- a linha operacional mantém somente três registros na primeira leitura;
- a ordenação existente continua priorizando atraso, compromisso futuro e recência;
- registros complementares ficam em uma divulgação nativa acessível por teclado;
- histórico completo e formulário de acompanhamento continuam disponíveis;
- tarefas, visitas e atividades continuam vindo do payload canônico existente.

## Impacto

- menor ruído no painel de próxima ação;
- retomada mais rápida do atendimento;
- atrasos não se misturam visualmente com histórico antigo;
- nenhuma informação ou operação foi removida.

## Limites

- nenhuma migration ou alteração de banco;
- nenhuma mudança em APIs, RLS, autenticação ou integrações;
- nenhum build, ZIP ou deploy.

## Validação

- `npm run ux:phase-047:check`
- `npm run typecheck`
- `npm run lint`
- `npm test`

## Próxima etapa

Fase 48: simplificar a edição do perfil comercial no Lead 360, mantendo os campos essenciais no fluxo e os complementares sob demanda.
