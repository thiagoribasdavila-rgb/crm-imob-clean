# V3000 — Fase 45: continuidade comprovada da conversa

## Objetivo

Permitir que o corretor reconheça, no próprio card do Pipeline, onde o contato
parou antes de executar a próxima ação. A leitura é curta e operacional:
resposta do cliente, canal comprovado, tempo do último contato e próximo
compromisso.

## Entrega funcional

- a API do Pipeline enriquece cada oportunidade com a última conversa e a
  última mensagem disponíveis para o mesmo `organization_id`;
- o card distingue `Cliente respondeu`, `Aguardando resposta`, `Interação
  registrada`, `Contato no histórico` e `Sem conversa comprovada`;
- o próximo compromisso continua vindo do campo operacional
  `leads.next_action_at`;
- falha ou ausência das tabelas de mensageria não interrompe o Pipeline: a
  interface volta ao histórico de contato já registrado no lead.

## Proveniência e privacidade

A consulta usa somente metadados de `conversations` e `messages`. O conteúdo da
mensagem não é selecionado, devolvido pela API ou exibido no Kanban. O canal só
é marcado como comprovado quando a mensagem tem `external_message_id` ou um
status de envio, entrega, leitura ou recebimento.

Consequentemente, o texto `WhatsApp comprovado` nunca nasce apenas do valor
`channel = whatsapp`. Sem prova de webhook/linha, o card mostra `Canal não
comprovado`.

## Segurança operacional

- leitura somente leitura e isolada por organização;
- nenhuma migration;
- nenhuma alteração de etapa, tarefa ou compromisso;
- nenhum conteúdo pessoal novo exposto;
- nenhuma chamada a provedor de IA ou mensageria.

## Aceite

O corretor consegue identificar a direção da última interação e o próximo
compromisso sem abrir o histórico completo, evitando repetir uma abordagem já
registrada. A ação primária única da Fase 44 permanece inalterada.

## Validação

```bash
npm run check:v3000:phase45
npm run test:v3000:phase45
npm run check:v3000:phase44
npm run test:v3000:phase44
npm run typecheck
git diff --check
```

O build completo e o ZIP continuam reservados ao gate de release do ciclo.
