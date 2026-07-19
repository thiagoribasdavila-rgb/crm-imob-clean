# ATLAS AI OS — Fase 97/3000

## Objetivo

Medir a prontidão real de escrita dos cinco módulos prioritários e mostrar no Command Center somente ações comprovadamente seguras. A leitura continuar funcionando não significa, por si só, que criar ou alterar dados está homologado.

## Problema resolvido

Depois da Fase 96, os módulos já informavam sua saúde de leitura. Ainda faltava responder à pergunta operacional mais importante: **o usuário pode agir com segurança agora?**

Sem essa separação, Projetos poderia parecer pronto para cadastro completo apenas porque `crm_projects` estava legível, embora a rota futura de escrita dependa de `developments`, `developers` e de uma RPC que não existem no contrato vivo auditado. Também era necessário deixar explícito que Clientes 360 continua sendo uma visão derivada e deve atualizar a lead de origem.

## Alterações realizadas

- criado o contrato `live-write-readiness-v1`;
- evoluído o endpoint de saúde para `module-health-v2`;
- adicionados os estados `ready`, `source-mediated` e `blocked`;
- confirmadas por código as escritas protegidas de Leads, Pipeline e Tarefas;
- mantida a lead como fonte única de escrita do Clientes 360;
- bloqueada a promessa de cadastro completo de Projetos enquanto o contrato físico não for homologado;
- qualquer falha de leitura agora bloqueia automaticamente a orientação de escrita;
- adicionadas, no Command Center, uma ação segura e uma explicação curta para cada módulo;
- preservada a Fase 97 histórica do centro de integrações, sem sobrescrever seus artefatos.

## Matriz operacional

| Módulo | Escrita | Caminho seguro | Evidência |
| --- | --- | --- | --- |
| Leads | Pronta | Novo lead / Lead 360 | identidade, tenant, duplicidade e `lead_events` |
| Pipeline | Pronta | Prioridades do funil | conflito otimista, `pipeline_history` e escrita compensatória |
| Tarefas e agenda | Pronta | Nova tarefa | contexto autenticado, RLS, responsável visível e confirmação humana do Copilot |
| Clientes 360 | Via origem | Localizar lead | fonte única preservada em `public.leads` |
| Projetos | Bloqueada | Revisar homologação | leitura em `crm_projects`; domínio futuro de escrita ainda não vivo |

## Impacto operacional

- o corretor distingue módulo disponível de ação realmente executável;
- o gerente recebe um caminho curto para criar lead, mover oportunidade ou agendar tarefa;
- o Cliente 360 não cria um segundo cadastro concorrente;
- a diretoria não é levada a uma gravação de Projetos que depende de migrations ainda não aprovadas;
- bloqueios deixam de ser mensagens genéricas e passam a apontar a próxima revisão humana segura.

## Segurança e Supabase

- nenhuma escrita de teste foi executada no banco real;
- nenhuma migration, conta, perfil ou sessão foi alterada;
- a prontidão é derivada de rotas já implementadas e do contrato vivo auditado na Fase 94;
- o endpoint de saúde continua sem chave administrativa;
- a exposição pela Data API não é inferida pela simples existência de uma migration local: grants, RLS e contrato físico precisam estar comprovados;
- uma leitura indisponível nunca é classificada como escrita pronta.

## Riscos identificados

- a prontidão comprova o caminho técnico existente, mas não substitui homologação humana ponta a ponta;
- Clientes 360 ainda depende da lead como cadastro principal;
- o cadastro completo de Projetos precisa de um adaptador mínimo sobre a base viva ou de uma migration isolada, revisada e testada — nunca do lote de migrations pendentes;
- regras hierárquicas avançadas permanecem limitadas pelo contrato atual de perfis.

## Checklist de validação

- [x] cinco módulos possuem estado de leitura e escrita separados;
- [x] Leads, Pipeline e Tarefas apontam para rotas existentes e protegidas;
- [x] Clientes 360 preserva a fonte única em Leads;
- [x] Projetos não anuncia escrita futura como disponível;
- [x] falha de leitura bloqueia a escrita;
- [x] nenhum teste destrutivo foi executado;
- [x] nenhuma migration, Auth ou dado real foi alterado;
- [x] nenhum erro técnico bruto foi adicionado à interface;
- [x] build e ZIP seguem reservados ao checkpoint da Fase 100.

## Próxima etapa recomendada

Fase 98: desenhar o menor adaptador auditável de escrita de Projetos sobre a base viva, com escopo de diretoria, validação de tenant e trilha de eventos, sem aplicar migrations em lote e sem liberar gravação antes da homologação.
