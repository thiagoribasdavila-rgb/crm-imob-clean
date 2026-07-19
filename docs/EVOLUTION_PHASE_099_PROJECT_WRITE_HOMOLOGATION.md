# ATLAS AI OS — Fase 99/3000

## Objetivo da fase

Homologar o desenho de escrita de Projetos sem liberar mutações prematuras. A fase fecha o contrato de papéis, a trilha persistente e o comando transacional que serão aplicados primeiro em um ambiente isolado.

## Problema resolvido

O contrato vivo usa `crm_projects`, porém a função comercial compartilhada aceita papéis legados (`GESTOR` e `INCORPORADORA`) que não pertencem à constraint canônica atual de `profiles`. Alterá-la seria inseguro: ela atende 14 políticas distribuídas por Projetos, Estoque, Conhecimento, Campanhas e Investimento de marketing.

Também não existia uma tabela persistente de eventos de projeto. Liberar `insert` ou `update` diretamente criaria mudanças sem motivo obrigatório, idempotência ou garantia de que dado e auditoria seriam confirmados na mesma transação.

## Alterações realizadas

- Mantida intacta a função compartilhada `private.can_manage_commercial_data()`.
- Criado contrato específico `private.can_manage_projects(organization_id)` para `ADMIN`, `DIRETOR_DECISOR`, `DIRETOR` e `GERENTE` ativos no tenant exato.
- Desenhada a tabela append-only `crm_project_events`, com ator, motivo, campos alterados, antes/depois, tenant e chave de idempotência.
- Desenhado o comando atômico `mutate_crm_project_v1` para `create` e `update`.
- Bloqueados `DELETE` e DML direto no primeiro rollout.
- Criada matriz de autorização, isolamento entre tenants, replay idempotente, conflito e rollback.
- Evoluída a prontidão para `live-write-readiness-v3`, ainda explicitamente bloqueada.
- Gerada a migration local `20260719042811_project_write_audit_gate.sql`; ela **não foi aplicada**.

## Contrato de ativação

O gate somente aprova escrita quando todas as evidências estiverem presentes:

1. migration aplicada em homologação isolada;
2. helper de papéis e tabela de eventos disponíveis;
3. RPC atômica disponível;
4. matriz de papéis testada;
5. rollback de criação e atualização comprovado;
6. isolamento cross-tenant comprovado;
7. idempotência comprovada;
8. aceite humano registrado.

Enquanto qualquer item faltar, `activationAllowed` permanece `false` e a interface oferece apenas pré-validação.

## Matriz mínima de homologação

| Cenário | Resultado esperado |
| --- | --- |
| ADMIN, DIRETOR_DECISOR, DIRETOR ou GERENTE no mesmo tenant | criar e atualizar |
| CORRETOR no mesmo tenant | negar |
| Usuário sem autenticação | negar |
| Gestor tentando outro tenant | negar |
| Mesma chave e mesmo pedido | devolver resultado original sem duplicar |
| Mesma chave com pedido diferente | rejeitar conflito |
| Falha ao registrar evento | reverter a mudança do projeto |
| Operação de exclusão | rejeitar |

## Impacto operacional

Projetos deixa de depender de uma permissão comercial genérica e passa a ter um caminho de ativação pequeno, auditável e reversível. O gestor poderá corrigir o portfólio sem expor outros tenants e sem criar alterações silenciosas. A operação atual permanece estável porque nenhuma escrita ou migration foi ativada nesta fase.

## Riscos identificados

- A migration ainda precisa ser aplicada e testada primeiro em homologação.
- O comando `SECURITY DEFINER` é deliberadamente estreito, mas exige revisão de privilégios após a aplicação.
- Políticas e grants legados precisam ser capturados antes da aplicação para rollback fiel.
- O banco vivo ainda possui permissões históricas amplas em `crm_projects`; removê-las sem teste poderia quebrar fluxos antigos.
- `DELETE` permanece fora do escopo até existir política própria de arquivamento e retenção.
- Riscos de segurança já existentes fora deste domínio não foram misturados nesta fase.

## Plano de aplicação controlada

1. capturar policies, grants e assinatura das funções atuais;
2. criar backup lógico das tabelas envolvidas;
3. aplicar a migration em homologação isolada;
4. executar a matriz completa com usuários reais de teste;
5. provocar falhas controladas para provar rollback;
6. validar que duas requisições idênticas geram um evento;
7. revisar os advisors de segurança e performance;
8. registrar aceite humano antes de habilitar qualquer endpoint de mutação.

## Plano de rollback

- desabilitar o futuro endpoint de comando;
- revogar `EXECUTE` da RPC para `authenticated`;
- preservar os projetos e o histórico já gravado;
- restaurar policies e grants capturados antes da aplicação;
- nunca apagar eventos para encobrir uma falha.

## Checklist de validação

- [x] Contrato canônico de papéis definido.
- [x] Função comercial compartilhada preservada.
- [x] Evento persistente append-only desenhado.
- [x] Operação atômica e idempotente desenhada.
- [x] Escrita direta e exclusão mantidas bloqueadas.
- [x] Migration local criada por ferramenta oficial e não aplicada.
- [x] Typecheck e regressões da fase executáveis sem build.
- [ ] Migration aplicada em homologação.
- [ ] Matriz de papéis e tenants comprovada.
- [ ] Rollback e idempotência comprovados no banco.
- [ ] Aceite humano registrado.

## Próxima etapa recomendada

A Fase 100 é o checkpoint de release: rodar as regressões completas, executar **um único build** e gerar o pacote Hostinger somente se todos os gates técnicos forem aprovados. A aplicação desta migration permanece uma atividade separada e controlada; o ZIP não deve fingir que o banco vivo já foi migrado.
