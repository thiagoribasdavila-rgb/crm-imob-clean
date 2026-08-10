# Atlas One — Fase 1: captura assistida de atendimento

Data: 4 de agosto de 2026

## Objetivo

Reduzir o trabalho manual do corretor depois de uma ligação, conversa de
WhatsApp, reunião, visita ou e-mail. A anotação do atendimento é convertida em
um rascunho estruturado com resultado, intenção, objeções, resumo e próxima
ação. O corretor continua sendo a pessoa responsável por revisar e confirmar o
registro.

## Fluxo entregue

1. O corretor abre a Lead 360 e escolhe o canal do atendimento.
2. Cola ou escreve a anotação original.
3. O Atlas prepara um rascunho, usando OpenAI quando disponível e análise local
   segura quando a integração estiver indisponível.
4. O corretor edita os campos necessários.
5. Qualquer edição invalida a confirmação anterior e exige nova revisão.
6. Somente após confirmação humana o registro entra no histórico da lead.

## Regras de segurança e verdade comercial

- O rascunho não altera lead, pipeline, tarefa, agenda ou memória comercial.
- A anotação original só é persistida depois da confirmação humana.
- A requisição exige sessão válida e acesso à lead no escopo comercial.
- A confirmação possui identificador único e é idempotente.
- O texto da conversa não é gravado em logs nem na memória comercial da IA.
- A chamada OpenAI usa `store: false` por meio do roteador já existente.
- Dados pessoais não são roteados para provedores econômicos externos.
- Nenhuma mensagem, tarefa, mudança de etapa ou ação externa é executada
  automaticamente.
- Erros inesperados são sanitizados antes de chegar à interface.
- Nome de provedor e modelo informado pelo navegador não é aceito como fonte
  confiável fora do conjunto permitido.

## Persistência

O registro confirmado reutiliza `lead_events` com:

- `event_type`: `assisted_interaction_confirmed`;
- organização, lead e autor já validados;
- anotação original preservada em `metadata.originalNote`;
- campos estruturados revisados;
- confirmação humana explícita;
- sinalizadores de ausência de ação automática e de memória bruta.

Nenhuma migration foi necessária. O isolamento e as permissões existentes de
`lead_events` foram preservados.

## Arquivos alterados

- `app/(crm)/leads/[id]/page.tsx`
- `app/api/v1/leads/[id]/assisted-interaction/route.ts`
- `components/crm/assisted-interaction-capture.tsx`
- `lib/ai/assisted-interaction.ts`
- `tests/contracts/assisted-interaction-capture.test.mjs`

## Validação executada

- TypeScript: aprovado, zero erros.
- ESLint: aprovado, zero alertas.
- Testes específicos: 6 de 6 aprovados.
- Suíte completa de contratos: 299 de 299 aprovados.
- Banco remoto: não alterado.
- Build e ZIP: não executados nesta fase; permanecem reservados para o gate de
  release solicitado pelo projeto.

## Resultado operacional

O corretor deixa de transformar manualmente uma anotação livre em vários campos
do CRM. O Atlas ajuda a estruturar o atendimento, mas a pessoa continua no
controle da informação oficial e da próxima ação.

## Próxima fase recomendada

Medir o uso real da captura assistida sem automatizar contato: quantidade de
rascunhos gerados, confirmações humanas, descartes e tempo médio até a próxima
ação. A medição deve ser agregada, sem armazenar o conteúdo bruto das conversas.
