# ATLAS ONE — Fase 356: revisão de acesso das funções privilegiadas

## Resultado desta entrega

As quatro funções `SECURITY DEFINER` ainda visíveis ao papel `authenticated`
foram classificadas individualmente. Esta fase não altera schema, ACL, dados,
usuários, organização, autenticação ou operação real: ela evita uma revogação
indiscriminada que quebraria policies e contratos autenticados já existentes.

## Matriz factual remota em 09/08/2026

Projeto de homologação: `pozbrcsfthnhmnebfoxv`.

| Função | Hash remoto da definição | `anon` | `authenticated` | `service_role` | Dependência comprovada | Decisão |
|---|---:|---:|---:|---:|---|---|
| `current_organization_id()` | `3899d201fe258d392ce8c5d10bfb60d0` | não | sim | sim | 186 policies RLS | preservar o contrato autenticado |
| `current_user_role()` | `381508b00066769b71e609c83e7e5af6` | não | sim | sim | 3 policies RLS | preservar o contrato autenticado |
| `mutate_crm_project_v1(uuid,text,uuid,jsonb,text,text)` | `ff5f95305bb9f22567fdb1788c03b55a` | não | sim | sim | RPC governada e ensaio multi-tenant da fase 8 | preservar até a prova dinâmica |
| `create_lead_atomic(uuid,uuid,uuid,text,text,text,text,text,numeric,numeric,integer,text[],text,integer,text,jsonb)` | `7895451395c053b54be5e840cef397b0` | não | sim | sim | RPC atômica incluída na matriz e no ensaio da fase 8 | preservar temporariamente e decidir após a prova dinâmica |

Os hashes servem apenas para reconhecer exatamente a versão auditada. Nenhum
corpo de função foi modificado nesta fase.

## Análise por função

### `current_organization_id()`

- É chamada por 186 policies RLS remotas.
- O corpo público apenas delega a `private.current_organization_id()`.
- A função remota possui `search_path` vazio.
- `anon` não possui `EXECUTE`.

Revogar `authenticated` impediria a avaliação das próprias policies que isolam
os dados por organização. O aviso do advisor é, neste caso, uma exceção
arquitetural deliberada, não evidência suficiente de vulnerabilidade.

### `current_user_role()`

- É chamada por 3 policies RLS remotas.
- Consulta apenas o perfil de `auth.uid()` ativo.
- Usa referências qualificadas a `public.profiles` e `auth.uid()`.
- A função remota possui `search_path` vazio e `anon` não possui `EXECUTE`.

O contrato autenticado deve ser preservado para que as policies que dependem
do papel comercial continuem funcionando.

### `mutate_crm_project_v1(...)`

- Rejeita ausência de `auth.uid()`.
- Compara o tenant informado com `private.current_organization_id()`.
- Exige `private.can_manage_projects(...)`.
- Aceita somente `create` e `update`; não oferece exclusão.
- Limita os campos permitidos, exige motivo e chave de idempotência.
- Mantém trilha append-only em `crm_project_events`.
- Possui `search_path` vazio e referências qualificadas.
- O ensaio da fase 8 contém prova negativa cross-tenant.

É uma API de banco autenticada e governada. Fechá-la antes do ensaio dinâmico
quebraria um contrato intencional sem provar ganho de segurança.

### `create_lead_atomic(...)`

- Rejeita requisição sem `auth.uid()`.
- Exige a organização atual e `assigned_to = auth.uid()`.
- Serializa a deduplicação com advisory lock.
- Bloqueia contatos suprimidos e evita duplicidade por telefone/e-mail.
- O ensaio da fase 8 comprova a rejeição de um owner forjado.
- A rota ativa `app/api/v1/leads/route.ts` não chama essa RPC; ela grava na
  tabela canônica `leads` pelo servidor.

A função ainda é um contrato explícito da matriz de acesso e dos testes de
isolamento, mas não possui consumidor direto na rota ativa. Seu `search_path`
remoto é `public, pg_temp`, menos restritivo que o padrão atual do projeto.
Por isso a decisão é preservar somente até uma prova autenticada conclusiva:

1. se não houver consumidor real, retirar o contrato autenticado de forma
   versionada;
2. se o contrato for mantido, testar e migrar para `search_path = ''`, sem
   alterar comportamento, antes da homologação.

## O que esta fase deliberadamente não fez

- não revogou permissões necessárias às policies;
- não alterou as quatro funções;
- não executou migration;
- não criou fixtures nem dados fictícios;
- não simulou aprovação de teste real;
- não marcou os avisos do advisor como resolvidos.

## Gates para encerrar as exceções

1. Executar `phase_008_dynamic_rls_isolation.test.sql` em clone isolado com
   dois tenants e os papéis corretor, gerente e diretor.
2. Provar caminhos positivos e negativos das duas RPCs autenticadas.
3. Decidir formalmente a aposentadoria ou o hardening de
   `create_lead_atomic(...)`.
4. Reexecutar os advisors depois de qualquer DDL.
5. Manter documentada qualquer exceção que continuar necessária.

O aviso de proteção contra senhas vazadas continua sendo uma configuração do
Auth no painel do projeto e não foi alterado por esta revisão de funções.

## Validações

- contrato estático desta fase;
- contrato do cadastro ativo da fase 51;
- matriz de acesso da fase 7;
- ensaio multi-tenant preparado da fase 8;
- hardening vivo do Supabase;
- varredura de segredos;
- TypeScript e ESLint do escopo modificado.

## Gate de release

Esta revisão reduz risco de regressão, mas não libera build, ZIP ou deploy. A
prova autenticada da fase 353, o baseline factual da fase 350 e a medição da
fase 354 continuam pendentes. O marcador oficial permanece na fase **349**.

