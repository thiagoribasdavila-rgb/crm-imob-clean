# Atlas One — Fase 48: edição progressiva do perfil comercial

## Objetivo

Diminuir o esforço de atualização do Lead 360 ao separar os dados que mudam a decisão comercial dos campos usados apenas em consultas ou correções ocasionais.

## Alterações

- etapa, temperatura, orçamento máximo e regiões permanecem na primeira leitura;
- identidade, contato, origem, orçamento mínimo, dormitórios e observações ficam sob demanda;
- rótulos explícitos substituem a dependência exclusiva de placeholders nos campos decisivos;
- o mesmo formulário, estado e comando de salvamento foram preservados;
- a origem continua somente leitura e vinculada ao fluxo auditável já existente.

## Impacto

- quatro decisões principais em vez de dez campos simultâneos;
- menor risco de alterar dados estáveis durante um acompanhamento rápido;
- dados complementares continuam disponíveis sem criar outra tela;
- nenhuma informação ou operação foi removida.

## Limites

- nenhuma migration ou alteração de banco;
- nenhuma mudança em APIs, RLS, autenticação ou integrações;
- nenhum build, ZIP ou deploy.

## Validação

- `npm run ux:phase-048:check`
- `npm run typecheck`
- `npm run lint`
- `npm test`

## Próxima etapa

Fase 49: reduzir a repetição entre perfil, qualificação e próxima ação no Lead 360, preservando as evidências sob demanda.
