# Fase 039 — Agenda orientada ao tempo

## Resultado

A Agenda Comercial agora começa pela leitura temporal que orienta o trabalho: **o que atrasou, o que acontece hoje e o que vem nos próximos sete dias**. Quatro sinais objetivos mostram atrasos, compromissos do dia, planejamento imediato e visitas.

Logo abaixo, a área de atenção imediata exibe no máximo três compromissos vencidos ou previstos para hoje. A ordem usa somente prazo e atraso observados; não existe score, previsão ou prioridade inventada.

## Linha do tempo compacta

Tarefas, visitas e follow-ups permanecem reunidos na mesma agenda. O recorte selecionado é agrupado por dia, e cada item mostra:

- horário;
- tipo de compromisso;
- título;
- contexto disponível;
- acesso ao registro original.

Os cinco períodos existentes foram preservados: hoje, sete dias, mês, atrasados e todos. A composição completa por fonte fica disponível sob demanda, reduzindo a densidade inicial sem esconder informação.

## Fonte única e deduplicação

A tela continua usando a API autenticada existente, com tarefas, visitas e `leads.next_action_at`. Uma visita ativa e uma próxima ação no mesmo horário continuam aparecendo uma única vez.

Realtime e atualização manual foram preservados. A interface informa quando está sincronizada, conectando ou operando com atualização manual.

## Decisão humana e segurança

A Agenda apenas organiza compromissos já autorizados. Abrir o contexto, criar tarefa, concluir ação, confirmar visita, reagendar ou contatar cliente exige decisão humana explícita.

Não houve mudança em banco, schema, API, RLS, tenant, RBAC, autenticação ou rotas. Nenhuma escrita, atribuição, conclusão, confirmação, mensagem ou contato automático foi adicionado. O bloqueio de homologação da Fase 020 não foi contornado.

## Experiência e acessibilidade

- Períodos usam botões nativos com `aria-pressed`.
- A fila imediata e a linha do tempo anunciam atualizações de forma educada.
- Estados de carregamento usam `aria-busy`.
- Datas usam seções e horários usam o elemento `time`.
- Novos alvos interativos possuem pelo menos 44 px.
- Celular e tablet recebem uma linha do tempo compacta sem perder as ações.
- A política de movimento reduzido continua respeitada.

## Revisão React

- Nenhum estado ou efeito novo foi adicionado.
- Nenhum pedido de rede novo foi criado.
- Sinais, atenção imediata, períodos e grupos são derivados do payload existente.
- Chaves usam tipo e identificador estáveis.
- Links, botões, navegação, `details`, seções e horários preservam semântica nativa.

## Medição

A fase melhora estruturalmente a hierarquia e a leitura da agenda, mas não publica alegação de produtividade, velocidade ou conversão. Tempo real de planejamento e execução depende de telemetria e homologação com os perfis autorizados.

## Próxima fase

Fase 040 — **Melhorar Atividades**.

O próximo avanço deve transformar o histórico comercial em uma linha do tempo útil, pesquisável e explicável, sem duplicar a Agenda nem alterar registros históricos.
