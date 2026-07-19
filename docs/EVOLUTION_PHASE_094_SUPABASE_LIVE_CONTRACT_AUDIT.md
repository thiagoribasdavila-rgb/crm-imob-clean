# ATLAS AI OS — Fase 94/3000

## Objetivo

Estabelecer a verdade operacional do Supabase usado na homologação antes de qualquer migration, correção de tela ou nova automação. A auditoria comparou o banco vivo com os contratos dos 19 módulos Core V2, sempre em modo somente leitura.

## Problema resolvido

O repositório já descreve uma plataforma muito maior do que o banco publicado. Por isso, uma tela pode existir e ainda falhar ao consultar uma tabela ou coluna futura.

O código atual referencia 85 tabelas distintas nos caminhos de API e domínio auditados. Apenas 13 dessas referências existem hoje no banco vivo. O repositório contém 122 arquivos de migration, enquanto 33 constam como aplicados no Supabase. A diferença de 89 migrations impede qualquer aplicação em lote: elas precisam ser organizadas por dependência, compatibilidade e risco.

Esta fase não “corrigiu” o banco por aproximação. Ela mediu a diferença e criou o gate que evita transformar uma inconsistência conhecida em perda de dados.

## Evidência do banco vivo

### Conexão e tenant

- projeto configurado e saudável;
- PostgreSQL 17.6;
- 23 tabelas públicas e uma view;
- RLS habilitada nas 23 tabelas;
- 43 políticas registradas;
- 4 usuários no Auth e 4 perfis correspondentes;
- 4 perfis ativos;
- zero usuário sem perfil;
- zero perfil, lead ou tarefa sem organização.

O contexto básico multi-tenant existe. A hierarquia comercial completa ainda não está comprovada porque `access_role`, `commercial_role` e `reports_to` não existem fisicamente. O adapter atual consegue inferir uma árvore temporária, mas inferência não substitui uma relação oficial para autorização.

### Base comercial

- 17.151 leads no total;
- 17.148 vinculados a lotes de importação;
- 2 leads atribuídos a responsáveis;
- nenhum lead com próximo contato agendado;
- 7.508 leads com telefone;
- 15.743 leads com e-mail;
- 2 tarefas;
- 28 mudanças no histórico do pipeline;
- 7 eventos comerciais;
- 1 projeto no cadastro canônico vivo;
- zero unidade de estoque;
- 1 documento de conhecimento processado em 6 trechos.

Todos os leads possuem valor em `score_ia`, mas isso não comprova calibração. Existem somente 2 registros na evidência separada de score e nenhum evento de aprendizado da IA. A plataforma deve apresentar esse dado como score legado ou inicial, nunca como probabilidade preditiva validada.

## Compatibilidade real dos módulos

Nenhum dos 19 módulos foi declarado homologado apenas porque sua página abre.

Doze módulos possuem fontes suficientes para uma camada de compatibilidade segura:

- Command Center;
- Leads;
- Pipeline;
- Clientes 360;
- Tarefas e agenda;
- Projetos;
- Calendário;
- Atividades;
- Copilot;
- Distribuição;
- Relatórios;
- Revenue Engine.

Esses módulos ainda precisam usar o repositório compatível como fonte única. Exemplos já comprovados:

- `leads.score` corresponde hoje a `leads.score_ia`;
- `leads.assigned_to` corresponde a `assigned_user_id`;
- `leads.next_action_at` corresponde a `next_contact`;
- `profiles.full_name` corresponde a `profiles.name`;
- `tasks.due_at` corresponde a `tasks.due_date`;
- oportunidades podem ser derivadas temporariamente de `leads` e `pipeline_history`;
- projetos podem ser lidos de `crm_projects`;
- atividades podem ser lidas de `lead_events`.

Sete módulos permanecem bloqueados para operação completa:

- Reativação: não há lista física de supressão;
- Corretores: não há hierarquia oficial persistida;
- Vendas: não há recebíveis de comissão nem oportunidades canônicas;
- Usuários: papéis e subordinação ainda dependem de inferência;
- Vendas externas: não há compras externas persistidas;
- Integrações: catálogo e saúde das integrações não existem no banco vivo;
- Configurações: governança de IA e política de segurança não possuem fonte física.

Os sete domínios físicos ausentes são: compras externas, catálogo de integrações, saúde de integrações, lista de supressão, recebíveis de comissão, governança de IA e política de segurança.

## Segurança

### Pontos fortes

- todas as tabelas públicas têm RLS;
- políticas operacionais aplicam a organização atual;
- tabelas legadas isoladas usam bloqueio explícito;
- a view de desempenho dos provedores de IA usa `security_invoker=true`;
- a service role continua limitada ao servidor.

### Alertas que precisam de correção controlada

1. `search_knowledge_chunks` é uma função `SECURITY DEFINER` executável por anônimo e autenticado. O escopo de execução precisa ser reduzido depois de teste em staging.
2. A proteção contra senhas vazadas está desativada no Auth.
3. Dezenove tabelas ainda possuem grant de leitura para `anon`. As políticas atuais não concedem linhas anônimas, mas o princípio de menor privilégio recomenda retirar grants desnecessários.

Grants e RLS foram avaliados como camadas separadas, seguindo o modelo de segurança da Data API do Supabase. Nenhum grant ou policy foi alterado nesta fase.

## Desempenho

O Advisor oficial encontrou:

- 15 chaves estrangeiras sem índice de cobertura;
- 2 políticas que recalculam funções Auth por linha;
- 3 conjuntos de políticas permissivas duplicadas;
- 24 índices ainda sem uso registrado.

Índice sem uso não será removido automaticamente: o banco é recente e ainda não existe janela de observação suficiente. As correções positivas — índices de FK e otimização das policies — devem entrar em uma migration mínima, reversível e testada, nunca misturadas à migração funcional dos módulos.

## Impacto operacional

- a base de mais de 17 mil leads foi confirmada sem expor dados pessoais;
- o principal gargalo de conversão ficou mensurável: somente 2 leads têm responsável e nenhum possui próximo contato;
- erros como `leads.score`, `tasks.due_at`, `profiles.full_name` e tabelas ausentes deixam de ser tratados isoladamente;
- os 19 módulos passam a ter status explícito de adapter ou bloqueio;
- a próxima fase pode corrigir primeiro leitura, prioridade e fila comercial, sem criar outro sistema;
- IA, Meta e automações não serão apresentadas como ativas sem memória, eventos e integrações comprovadas.

## Riscos identificados

- aplicar as 89 migrations pendentes em lote pode criar conflitos, duplicidades ou uma arquitetura diferente da base real;
- inferir hierarquia no código não é suficiente para RBAC definitivo;
- `score_ia` preenchido pode ser confundido com previsão calibrada;
- a ausência de lista de supressão bloqueia reativação segura em massa;
- a falta de próximo contato em toda a base aumenta o risco de leads esquecidos;
- grants anônimos e a função `SECURITY DEFINER` precisam de hardening antes da produção;
- zero estoque impede que o catálogo de projetos sustente recomendação imobiliária completa.

## Checklist de validação

- [x] conexão configurada confirmada;
- [x] schema e migrations inventariados em leitura;
- [x] 19 módulos comparados com fontes reais;
- [x] aliases de campos legados documentados;
- [x] Auth e perfis reconciliados;
- [x] vínculos de organização medidos;
- [x] RLS, grants, view e funções avaliados;
- [x] Advisors de segurança e desempenho executados;
- [x] base de leads medida sem PII;
- [x] zero alteração de dados, usuários, policies ou schema;
- [x] build e ZIP preservados para a Fase 100.

## Próxima etapa recomendada

Fase 95: tornar um resolver canônico de capacidades e repositórios compatíveis a única porta de leitura dos módulos Core V2. A interface deve consultar o que o banco realmente suporta, usar aliases explícitos e bloquear ações sem contrato, antes de qualquer migration estrutural.
