# ATLAS AI OS — Fase 90/3000

## Objetivo

Evoluir o **Core V2 dentro do ATLAS V3 atual**. Esta nomenclatura representa a segunda maturidade da arquitetura oficial e não recria o produto legado V2.

O objetivo desta fase foi transformar a fundação arquitetural da fase 89 em regras reutilizáveis e verificáveis para layout, dados e eventos.

## Problema resolvido

O repositório já possuía boas telas e componentes, mas novas evoluções ainda podiam repetir quatro erros:

- desenhar páginas antes de definir a decisão comercial;
- consultar o Supabase diretamente em novas telas;
- misturar dados de organização, usuário e perfil sem um contexto único;
- registrar ações de humanos e IAs sem um envelope comum, idempotente e auditável.

## Alterações realizadas

### 1. Contrato oficial de página

Toda nova tela canônica passa a declarar:

- resultado comercial explícito;
- exatamente uma ação principal;
- no máximo cinco métricas de decisão;
- três profundidades: `glance`, `workspace` e `context`;
- fila priorizada;
- escopo por diretor, superintendente, gerente e corretor;
- dependências de dados com organização obrigatória;
- Copilot contextual;
- renderização server-first com ilhas interativas.

O registro inicial cobre Command Center, Leads, Pipeline, Clientes 360, Tarefas e Projetos.

### 2. Contrato oficial de dados

Foi criada a linguagem comum para:

- contexto de organização e usuário;
- leituras rastreáveis;
- comandos com chave de idempotência;
- repositórios independentes do provedor;
- exposição segura pela Data API.

Nenhuma nova tela deve consultar o Supabase diretamente. A migração dos módulos atuais será incremental, com adaptador e comparação antes da troca.

### 3. Contrato oficial de eventos

Eventos comerciais agora possuem uma definição comum com:

- organização e entidade de origem;
- ator humano, sistema ou agente;
- versão de schema;
- horário do fato e do registro;
- chave de idempotência;
- classificação de PII;
- imutabilidade.

Agentes nos níveis 3 e 4 não podem registrar execução sem aprovação humana explícita.

## Supabase e segurança

A regra atual do Supabase foi incorporada ao contrato: **grants explícitos da Data API e RLS são controles diferentes e devem ser entregues juntos**. A fase não alterou o banco ao vivo.

O contrato também impede tratar `user_metadata` como fonte de autorização e mantém a `service_role` restrita ao servidor, com finalidade e auditoria.

## Impacto operacional

- as próximas páginas serão menores, consistentes e orientadas à conversão;
- o time deixa de repetir decisões de layout e acesso em cada módulo;
- o Digital Twin passa a ter uma linguagem de eventos pronta para histórico e aprendizado;
- a IA pode recomendar e preparar ações sem ganhar autoridade silenciosa;
- a futura troca de provedor de dados ou modelo não exige redesenhar a experiência.

## Riscos identificados

- telas existentes ainda precisam ser migradas gradualmente ao registro oficial;
- grants, políticas e tabelas do Supabase ao vivo ainda precisam de inventário controlado;
- o ledger persistente será implementado em fase própria;
- a versão `Core V2` não deve ser confundida com o aplicativo legado removido.

## Checklist de validação

- [x] contrato de página validado em runtime;
- [x] limite de cinco métricas testado;
- [x] dependência sem tenant rejeitada;
- [x] grant sem RLS/política rejeitado;
- [x] execução autônoma sem aprovação rejeitada;
- [x] seis módulos registrados;
- [x] nenhum dado ou schema de produção alterado;
- [x] build e ZIP mantidos para o gate da fase 100.

## Próxima etapa recomendada

Fase 91: consolidar os tokens e primitivos visuais oficiais do Core V2. Depois, o App Shell e as páginas canônicas poderão ser redesenhados uma vez e reaproveitados em toda a plataforma.
