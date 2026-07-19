# ATLAS AI OS — Fase 95/3000

## Objetivo

Transformar o contrato medido na Fase 94 em uma porta única de leitura para os cinco domínios que mais afetam a operação diária: leads, pipeline, tarefas e agenda, Clientes 360 e projetos.

## Problema resolvido

As APIs já respeitavam organização e RLS em vários pontos, mas cada rota interpretava o legado separadamente. Essa repetição mantinha o risco de uma tela consultar `leads.score`, `tasks.due_at`, `opportunities` ou `developments`, embora o banco vivo use outros nomes ou relações.

A Fase 95 criou um resolver explícito de capacidades e repositórios compatíveis. A partir dele, uma coluna física é consultada uma vez e convertida para o contrato canônico antes de chegar ao módulo.

## Alterações realizadas

### Resolver de capacidades

`live-capability-resolver.ts` registra, para cada domínio:

- entidade canônica;
- fontes físicas reais;
- coluna de tenant;
- mapper utilizado;
- aliases autorizados;
- limitações que não podem ser apresentadas como prontidão.

Os cinco contratos ativos são:

1. leads → `public.leads`;
2. pipeline → `public.leads` + `public.pipeline_history`;
3. tarefas e agenda → `public.tasks` + `public.leads`;
4. Clientes 360 → `public.leads` + `public.profiles` + `public.crm_projects`;
5. projetos → `public.crm_projects` e seus complementos vivos.

### Repositório compatível

`live-repositories.ts` concentra as leituras e aplica:

- cliente Supabase autenticado recebido por injeção;
- filtro explícito por `organization_id` em toda consulta;
- RLS preservada;
- limite máximo de 5.000 linhas por leitura;
- exclusão de memória arquivada por padrão;
- erro sanitizado, sem mensagem técnica enviada à interface;
- versão do contrato `live-read-compat-v1` em toda resposta.

Nenhuma consulta nova usa service role. Nenhuma tabela futura foi criada ou consultada.

### Rotas conectadas

- Pipeline agora recebe leads e oportunidades derivadas pelo mesmo repositório.
- Tarefas e Agenda usam `due_date` e expõem `due_at` pelo mapper único.
- Clientes 360 reutiliza a mesma leitura compatível de leads.
- Calendário combina tarefas e follow-ups já normalizados.
- Launch OS lê `crm_projects` como developments e deriva oportunidades dos leads vivos.

## Impacto operacional

- elimina uma classe inteira de falhas por nomes divergentes entre V2 e V3;
- mantém os mais de 17 mil leads na fonte real, sem duplicação;
- deixa pipeline, tarefas, agenda, Clientes 360 e projetos com o mesmo limite de tenant;
- reduz retrabalho: uma futura migration altera o adapter, não cinco telas;
- prepara a Fase 96 para medir saúde individual por módulo sem mensagem genérica de indisponibilidade.

## Riscos identificados

- `score_ia` ainda não é probabilidade calibrada;
- Clientes 360 continua sendo uma visão derivada de leads;
- o pipeline ainda não possui entidade física de oportunidade;
- o tenant vivo ainda não possui estoque;
- hierarquia comercial definitiva exige uma migration mínima e revisada;
- a leitura máxima de 5.000 linhas mantém as telas rápidas, mas análises completas da base devem usar agregações no banco ou processamento assíncrono.

## Checklist de validação

- [x] Fase 94 preservada;
- [x] cinco capacidades registradas;
- [x] aliases legados centralizados;
- [x] filtros explícitos por organização;
- [x] RLS preservada;
- [x] nenhuma service role importada no repositório;
- [x] nenhuma tabela futura consultada;
- [x] cinco rotas operacionais conectadas;
- [x] zero alteração de banco, Auth ou dados;
- [x] build e ZIP preservados para a Fase 100.

## Próxima etapa recomendada

Fase 96: conectar as superfícies restantes ao repositório canônico e publicar saúde individual de cada módulo, distinguindo operacional, compatível, limitado e bloqueado. Isso evita que uma falha parcial derrube o Command Center inteiro.
