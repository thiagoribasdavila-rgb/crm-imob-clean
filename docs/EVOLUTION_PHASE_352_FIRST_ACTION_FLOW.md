# Fase 352 — Primeira ação comercial atômica

## Resultado da entrega

A fila prioritária de leads agora possui um fluxo explícito para o corretor registrar o resultado do primeiro contato e agendar o próximo passo em uma única confirmação humana.

A operação preparada é transacional: atividade, tarefa, atualização da lead e evento de auditoria são persistidos juntos. Se qualquer gravação falhar, nenhuma delas é confirmada.

## Decisão operacional

O formulário solicita apenas o necessário para manter a operação útil:

- canal utilizado;
- resultado observado;
- nota comercial objetiva;
- título e data da próxima ação.

Não há mensagem automática, distribuição automática nem decisão autônoma da IA. O corretor confirma a ação; o Atlas apenas preserva consistência e reduz retrabalho.

## Proteções implementadas

- autenticação, organização, papel e hierarquia antes da escrita;
- confirmação humana obrigatória;
- limite de requisições;
- chave idempotente por intenção de gravação;
- bloqueio transacional da lead;
- ator ativo na mesma organização;
- responsável ativo na mesma organização, com fallback seguro para o ator;
- RPC executável somente por `service_role`;
- mensagens públicas sem detalhes técnicos;
- logs estruturados sem nota, telefone, e-mail ou conteúdo pessoal.

## Compatibilidade confirmada com a base existente

A migration usa os contratos legados já mantidos pelo projeto:

- `activities`: histórico comercial;
- `tasks`: `due_date`, `user_id`, status e metadados canônicos da base remota;
- `leads`: status, última interação e próxima ação;
- `lead_events`: trilha de auditoria utilizada pelos fluxos atuais.

Nenhuma tabela paralela, dado fictício ou nova arquitetura foi criada.

## Arquivos da fase

- `app/api/v1/leads/[id]/first-action/route.ts`
- `app/(crm)/leads/page.tsx`
- `app/globals.css`
- `supabase/migrations/20260809120000_phase_352_atomic_first_action.sql`
- `tests/contracts/lead-first-action-flow.test.mjs`
- `config/value-delivery-phase-352-first-action-flow.json`

## Reconciliação remota em 09/08/2026

A migration foi comparada com o catálogo real antes da aplicação. A versão inicial referenciava campos que não existem no ambiente remoto (`activities.title`, `tasks.due_at` e `tasks.assigned_to`); o SQL e o verificador foram corrigidos para os contratos reais antes de qualquer escrita.

A migration `phase_352_atomic_first_action` foi aplicada com sucesso no projeto de homologação e registrada remotamente como versão `20260809214608`.

Verificações posteriores:

- RLS ativo em `activities`, `lead_events`, `leads`, `profiles` e `tasks`;
- `record_lead_first_action` permanece `SECURITY DEFINER`;
- `anon` e `authenticated` não possuem `EXECUTE`;
- somente `service_role` possui `EXECUTE`;
- o Security Advisor não reportou exposição da função nova;
- contratos específicos: 13/13 aprovados;
- TypeScript e ESLint: aprovados.

## Limite da homologação

A aplicação da migration conclui a entrega estrutural, mas não substitui a prova autenticada com um corretor e uma lead explicitamente designada.

Por isso:

- o marcador oficial permanece em 349;
- a alteração remota está aplicada e auditada;
- não há build, ZIP ou deploy nesta fase;
- a fase 353 é a prova autenticada do fluxo completo.

## Reversão segura

Antes da aplicação remota, basta remover rota, formulário e migration. Depois de aplicada, a função pode ser removida sem apagar atividades, tarefas ou eventos comerciais já confirmados.
