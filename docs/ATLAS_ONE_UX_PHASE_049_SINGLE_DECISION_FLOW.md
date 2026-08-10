# Atlas One — Fase 49: fluxo único de decisão no Lead 360

## Objetivo

Eliminar a repetição visual entre perfil, qualificação e próxima ação sem reduzir a explicabilidade do score ou o contexto necessário para o atendimento.

## Alterações

- o perfil passou a tratar somente dos dados comerciais editáveis;
- a qualificação passou a apresentar evidências, confiança, riscos, lacunas e perguntas;
- a rotina passou a concentrar ações, compromissos e histórico recente;
- dois painéis repetidos de próxima ação foram retirados;
- a recomendação canônica continua no resumo operacional e na linha do tempo.

## Impacto

- cada bloco responde a uma pergunta diferente;
- menor repetição da mesma recomendação na tela;
- explicabilidade da IA preservada sob demanda;
- nenhuma ação, dado ou histórico foi removido.

## Limites

- nenhuma migration ou alteração de banco;
- nenhuma mudança em APIs, RLS, autenticação ou integrações;
- nenhum build, ZIP ou deploy.

## Validação

- `npm run ux:phase-049:check`
- `npm run typecheck`
- `npm run lint`
- `npm test`

## Próxima etapa

Fase 50: levar o material vigente do projeto ao atendimento com uma ação direta, evitando navegação entre várias telas.
