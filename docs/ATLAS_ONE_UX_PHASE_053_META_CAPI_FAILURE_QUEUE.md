# Atlas One — Fase 53

## Fila operacional de falhas Meta/CAPI

A Saúde das Integrações deixa de mostrar somente totais de fila e passa a apresentar as dead letters como trabalho operacional supervisionado.

### O que mudou

- `/integrations/health` é o ponto canônico para diagnosticar e tratar falhas.
- Conversões Meta/CAPI, captura de Lead Ads e mensagens recebem nomes compreensíveis.
- A interface mostra motivo sanitizado, horário, tentativas e disponibilidade de reprocessamento.
- O botão de reprocessamento reutiliza o endpoint governado já existente.
- A Central de Notificações direciona a diretoria para a fila correta.

### Segurança e governança

- Nenhum payload, contato, segredo ou erro bruto do provedor é devolvido na fila.
- O reprocessamento exige sessão válida, organização correta e papel de diretoria.
- A ação apenas devolve o evento à outbox existente; não altera campanhas, públicos ou orçamento.
- Não há reprocessamento automático iniciado pela interface.

### Escopo preservado

Esta fase não criou migration, não alterou o banco, não enviou evento à Meta, não executou build e não gerou release.
