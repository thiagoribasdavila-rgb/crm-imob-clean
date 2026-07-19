# ATLAS AI OS — Fase 98/3000

## Objetivo

Criar o menor adaptador auditável para pré-validar criação e atualização de Projetos sobre a tabela viva `public.crm_projects`, sem executar gravação, migration, alteração de Auth ou teste destrutivo antes da homologação controlada.

## Problema resolvido

A leitura do portfólio já estava conectada à tabela viva, mas o cadastro completo existente no código aponta para um domínio futuro (`developments`, `developers` e RPCs relacionadas) que ainda não está disponível no contrato real. Liberar esse fluxo agora repetiria os erros de tabela ausente e poderia misturar duas fontes de verdade.

A auditoria de leitura do Supabase confirmou um segundo bloqueio: a função usada pelas políticas de escrita aceita `ADMIN`, `GESTOR` e `INCORPORADORA`, enquanto os perfis ativos observados usam `ADMIN`, `DIRETOR`, `GERENTE` e `CORRETOR`. Também não existe uma tabela persistente de eventos de Projetos. Portanto, a decisão segura é validar tudo o que pode ser comprovado e manter a mutação desligada.

## Alterações realizadas

- criado o contrato `live-development-write-adapter-v1`;
- criada uma rota protegida GET/POST de pré-validação;
- limitado o payload aos campos que realmente existem em `crm_projects`;
- bloqueada a injeção de `id`, `organization_id`, datas de auditoria e campos futuros;
- validados nome, código, status, datas e ordem lançamento/entrega;
- validados duplicidade de nome e código dentro do tenant atual;
- validado o projeto-alvo dentro do tenant em revisões;
- preservado o cliente Supabase autenticado e a RLS, sem chave administrativa;
- registrado o resultado da pré-validação em log estruturado sem nomes, endereços ou valores do projeto;
- evoluída a prontidão de escrita para `live-write-readiness-v2`;
- mantida a gravação explicitamente desligada até a Fase 99.

## Contrato mínimo vivo

| Item | Evidência confirmada |
| --- | --- |
| Fonte | `public.crm_projects` |
| Tenant | `organization_id` obrigatório |
| Identidade | `id` UUID gerado pelo banco |
| Nome | único por organização |
| Código | único por organização quando informado |
| Status | `ACTIVE`, `PAUSED`, `SOLD_OUT`, `ARCHIVED` |
| RLS | ativa, com políticas autenticadas por tenant |
| Atualização | trigger de `updated_at` já presente |
| Eventos persistentes | ainda não disponíveis |

## Impacto operacional

- a diretoria pode preparar um cadastro e descobrir inconsistências antes de qualquer escrita;
- nomes e códigos duplicados deixam de chegar à etapa de implantação;
- um projeto de outro tenant nunca é considerado alvo válido;
- a interface pode explicar exatamente por que o cadastro ainda não foi liberado;
- o domínio futuro completo continua preservado para evolução posterior, sem competir com a base viva.

## Segurança e Supabase

- a pré-validação usa a sessão autenticada e mantém a RLS como fronteira real;
- o tenant vem do perfil validado no servidor, nunca do payload;
- a rota não importa `service_role`, não chama RPC administrativa e não implementa `insert`, `update` ou `delete`;
- erros internos do banco não são devolvidos ao usuário;
- nenhum write probe foi executado;
- nenhuma migration local foi aplicada;
- a auditoria encontrou grants amplos para `anon` na tabela legada. A RLS continua bloqueando acesso fora das políticas, mas a redução desses grants precisa de uma alteração isolada, revisada e reversível.

## Riscos identificados

- o papel `DIRETOR` atual não corresponde aos papéis aceitos por `private.can_manage_commercial_data()`;
- não há tabela persistente de eventos de Projetos para registrar antes/depois e justificativa;
- a pré-validação comprova o payload e o escopo, mas não substitui um teste humano ponta a ponta;
- o domínio futuro completo permanece indisponível e não deve ser consultado pela operação viva;
- grants legados de `anon` precisam de hardening específico, sem misturar essa correção com a ativação funcional.

## Checklist de validação

- [x] contrato físico de `crm_projects` conferido em modo somente leitura;
- [x] constraints de nome, código e status refletidas no adaptador;
- [x] organização derivada do contexto autenticado;
- [x] duplicidade consultada dentro do tenant;
- [x] update exige projeto visível no tenant;
- [x] payload não controla identidade nem tenant;
- [x] rota tem rate limit e limite de tamanho declarado;
- [x] nenhum erro bruto do banco é exposto;
- [x] nenhuma gravação, migration ou mudança de Auth foi executada;
- [x] build e ZIP continuam reservados ao checkpoint da Fase 100.

## Próxima etapa recomendada

Fase 99: homologar o contrato em uma revisão controlada, definir a mudança mínima e reversível para alinhar os papéis da RLS, especificar a trilha persistente de eventos e aprovar — ou manter bloqueada — a ativação antes do build único da Fase 100.
