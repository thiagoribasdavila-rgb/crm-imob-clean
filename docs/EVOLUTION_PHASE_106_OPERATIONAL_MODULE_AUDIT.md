# ATLAS AI OS — Fase 106

## Operational module audit

### Objetivo

Começar o ciclo V4 com uma auditoria real dos módulos que ainda aparecem com erro, dado vazio ou sensação de desconexão.

O foco desta fase não foi redesenhar telas ainda. Foi descobrir onde o ATLAS já está bem estruturado e onde ainda existem pontos antigos batendo direto no banco.

### O que existe hoje

O projeto já tem uma base mais madura do que parece nos prints:

- App Router com rotas comerciais completas;
- Command Center;
- Leads;
- Pipeline/Kanban;
- Tarefas;
- Agenda;
- Clientes 360;
- Projetos/Launch OS;
- Usuários e permissões;
- Relatórios;
- Integrações Meta;
- camadas de IA e Copilot;
- compatibilidade V2/V3 em `lib/atlas/core-v2/live-repositories.ts`;
- normalização de campos em `lib/compat/legacy-v2.ts`.

O Kanban não é uma tela isolada: `/kanban` redireciona para `/pipeline`. Portanto, a melhoria do Kanban deve acontecer na experiência do Pipeline.

### Problema encontrado

A causa raiz dos módulos inconsistentes não é “falta de tela”.

O problema é mistura de três padrões:

1. telas modernas usando APIs compatíveis;
2. telas ou componentes ainda consultando Supabase direto;
3. APIs antigas esperando schema V3 puro, como `opportunities`, `developments`, `ai_insights`, `profiles.full_name`, `tasks.due_at` e `leads.score`.

Isso explica erros como:

- agenda não carregar;
- projetos temporariamente indisponíveis;
- clientes 360 variando entre vazio e carregado;
- relatórios com campo inexistente;
- distribuição quebrando em `profiles.full_name`;
- componentes auxiliares tentando ler `tasks.due_at`;
- módulos antigos ainda esperando `opportunities`.

### Camada correta encontrada

A fonte confiável para a operação atual deve ser:

| Módulo | Camada correta |
|---|---|
| Leads | `LIVE_LEAD_SELECT` + `mapLegacyLead` |
| Pipeline/Kanban | `readCompatiblePipeline` |
| Tarefas | `readCompatibleTasks` |
| Agenda | `readCompatibleTasks` + `readCompatibleLeads` |
| Clientes 360 | `readCompatibleCustomers` |
| Projetos | `readCompatibleDevelopments` |
| Perfis | `LIVE_PROFILE_SELECT` + `mapLegacyProfile` |

Essa camada já resolve diferenças importantes:

- `score_ia` vira `score`;
- `classificacao_ia` vira `temperature`;
- `due_date` vira `due_at`;
- `crm_projects` vira desenvolvimento/projeto operacional;
- `profiles.name` vira nome exibível.

### Auditoria por módulo

#### Pipeline/Kanban

Status: parcialmente forte.

O Pipeline já usa `/api/v1/pipeline` e `readCompatiblePipeline`, então a base técnica é boa.

Problema principal:

- excesso de informação;
- card muito carregado;
- muitas ações competindo;
- experiência ainda parece painel técnico, não “próxima ação comercial”.

Direção:

- Kanban deve virar uma tela de decisão;
- primeira dobra deve mostrar só prioridade, etapa e próxima ação;
- detalhes avançados ficam progressivos;
- card precisa ser compacto, rápido e operável no celular;
- movimento entre etapas precisa parecer seguro e reversível.

#### Projetos

Status: rota existe, mas ainda precisa blindagem.

As páginas existem, incluindo:

- materiais;
- regras de pagamento;
- incorporadoras;
- homologação;
- inventário;
- catálogo;
- dossier.

Problema principal:

- a tela depende de consultas complementares que podem não existir ou ainda não estar populadas;
- a experiência deveria continuar útil mesmo com estoque/material incompleto.

Direção:

- manter `crm_projects` como fonte operacional;
- tratar inventário, campanhas e materiais como módulos opcionais;
- mostrar “cadastro pronto para completar” em vez de indisponível.

#### Tarefas e agenda

Status: API principal está no caminho certo.

`/api/v1/tasks` e `/api/v1/calendar` usam `readCompatibleTasks`.

Problema principal:

- ainda existem componentes auxiliares e rotas antigas lendo `due_at` direto;
- isso pode gerar inconsistência entre Agenda, Tarefas, notificações e lembretes.

Direção:

- todo uso de tarefa deve passar por adapter;
- `due_date` e `due_at` devem ser tratados como o mesmo prazo operacional;
- nenhuma tela deve quebrar se um dos campos não existir.

#### Clientes 360

Status: boa base.

`/api/v1/customers` usa `readCompatibleCustomers`.

Problema principal:

- telas antigas e buscas globais ainda podem ler schemas diferentes;
- a visão 360 precisa se manter simples: pessoa, histórico, próxima ação e potencial.

Direção:

- usar a mesma normalização do Lead 360;
- evitar expor dado frio/inativo sem contexto;
- separar base ativa, base de reativação e histórico protegido.

#### Usuários e permissões

Status: precisa endurecer compatibilidade.

`/api/v1/admin/users` já tenta normalizar `full_name` a partir de `name`.

Problema principal:

- há referências antigas a `profiles.full_name` em APIs e buscas;
- isso já apareceu no print de distribuição.

Direção:

- padronizar nome exibível;
- nunca consultar `profiles.full_name` sem fallback;
- manter hierarquia e RBAC sem duplicar lógica.

#### IA, Meta e Andromeda

Status: estruturado, mas deve ser governado por evidência.

Já existem rotas e scripts para Meta, eventos, validação e Andromeda loop.

Problema principal:

- a IA precisa consumir contexto operacional compatível, não tabelas ideais que podem não existir;
- Andromeda depende da qualidade dos sinais enviados, não de uma “API mágica”.

Direção:

- IA deve ler o mesmo contrato operacional que o CRM;
- eventos precisam sair de ações reais: lead recebido, qualificado, contato, visita, proposta, venda;
- primeiro modo deve ser supervisionado, com decisão humana.

### Próximas 5 fases corretivas

#### Fase 107 — API consistency shield

Impedir que telas críticas ignorem a camada de compatibilidade.

Resultado esperado:

- menos erros técnicos;
- módulos usando fonte única;
- base preparada para Kanban e IA.

#### Fase 108 — Profile compatibility hardening

Eliminar divergência entre `full_name`, `name`, `role`, `commercial_role` e status.

Resultado esperado:

- usuários carregam;
- distribuição carrega;
- busca global não quebra;
- hierarquia fica mais confiável.

#### Fase 109 — Tasks and agenda due date shield

Uniformizar `due_date` e `due_at`.

Resultado esperado:

- agenda carrega melhor;
- notificações deixam de falhar por campo inexistente;
- follow-ups ficam consistentes.

#### Fase 110 — Projects Launch OS recovery

Blindar Projetos para operar mesmo com material, estoque ou campanhas incompletos.

Resultado esperado:

- projetos deixam de parecer indisponíveis;
- incorporadora consegue ser cadastrada;
- corretor encontra material com menos ruído.

#### Fase 111 — Kanban decision-first redesign

Começar o redesenho do Kanban como workspace de execução.

Resultado esperado:

- card mais limpo;
- ação principal clara;
- prioridade visível;
- menos ruído;
- mais velocidade para o corretor.

### Impacto operacional

Esta fase transforma a próxima sequência de trabalho em correção orientada por causa raiz.

Em vez de “melhorar tudo”, agora sabemos onde atacar primeiro:

- contrato de dados;
- perfil/usuário;
- tarefa/agenda;
- projetos;
- Kanban.

Isso aumenta a chance de o ATLAS sair de “bonito, mas oscilando” para “usável todos os dias”.

### Checklist de validação

Rodar:

```bash
npm run evolution:phase-106:check
```

Build completo:

```bash
# Somente no fechamento de versão ou ZIP
npm run build
```

### Próxima etapa recomendada

Fase 107: corrigir as leituras críticas para garantir que os módulos principais usem a camada operacional compatível antes do redesign pesado do Kanban.
