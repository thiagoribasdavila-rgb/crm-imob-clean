# Atlas One — Fase 54

## Recomendação explicável e supervisionada

O Centro de Decisão passa a separar claramente prioridade, evidência, confiança e ação humana. A recomendação orienta a operação, mas não executa contatos, mudanças de etapa ou alterações financeiras.

### O que mudou

- Cada recomendação apresenta as evidências observadas em uma área expansível.
- Regras objetivas, como prazo vencido, são identificadas como determinísticas.
- Score comercial continua sendo prioridade, nunca é apresentado como confiança estatística.
- Quando não existe calibração registrada, a interface mostra `Confiança não calibrada` em vez de inventar um percentual.
- A ação leva o usuário ao registro correto para revisar e decidir.
- A Central de Notificações deixa de representar confiança ausente como `0%`.

### Governança

- O Atlas não executa contato, movimentação de funil ou mudança de orçamento nesta interface.
- Toda decisão permanece com corretor ou liderança conforme o contexto e as permissões existentes.
- A fase não adiciona dados pessoais nem expõe contexto além do já autorizado ao usuário.

### Escopo preservado

Não houve migration, alteração de banco, chamada externa, build, ZIP ou deploy.
