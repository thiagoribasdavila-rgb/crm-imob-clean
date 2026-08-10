# ATLAS ONE — Fase 355: fechamento de acesso da RPC de distribuição

## Resultado desta entrega

A função remota `public.distribute_project_leads_v5(uuid,uuid,uuid,integer,integer)` deixou de aceitar execução direta pelos papéis públicos `PUBLIC`, `anon` e `authenticated`. A execução permanece concedida somente a `service_role`, preservando a arquitetura atual em que a API do Atlas valida o diretor e chama o Supabase pelo servidor.

Nenhuma regra da roleta, lead, vínculo de projeto, fila, usuário, organização ou dado operacional foi alterado.

## Problema factual encontrado

O Security Advisor do Supabase identificou a função `distribute_project_leads_v5` como `SECURITY DEFINER` executável por clientes autenticados e anônimos. Nesse estado, um cliente poderia tentar contornar as verificações da rota da aplicação e chamar diretamente uma função com privilégios elevados.

A rota ativa do produto utiliza `getSupabaseAdmin()`, exige o papel `director` e invoca `distribute_project_leads_v4`. A versão `v5` existe no banco remoto por uma migration histórica que não está presente na pasta local, mas não é chamada pela interface atual.

## Correção aplicada

A migration idempotente:

- confirma a existência da assinatura exata antes de agir;
- revoga `EXECUTE` de `PUBLIC`, `anon` e `authenticated`;
- concede `EXECUTE` explicitamente apenas a `service_role`;
- não recria nem substitui a função;
- não modifica o corpo ou o contrato da distribuição.

Arquivo:

- `supabase/migrations/20260809215625_phase_355_distribution_rpc_hardening.sql`

Teste de contrato:

- `scripts/check-phase-355-distribution-rpc-hardening.mjs`

## Evidência remota em 09/08/2026

Projeto de homologação: `pozbrcsfthnhmnebfoxv`.

A migration foi aplicada e registrada remotamente como:

- versão: `20260809215720`;
- nome: `phase_355_distribution_rpc_hardening`.

Antes da correção, a ACL permitia execução por `PUBLIC`, `anon`, `authenticated` e `service_role`. Depois da correção, a ACL ficou limitada a `postgres` e `service_role`.

Provas posteriores:

- hash da definição antes e depois: `3203daca3413f7d70462e11d171aea98`;
- `SECURITY DEFINER`: preservado;
- `search_path`: vazio e seguro;
- `anon`: sem `EXECUTE`;
- `authenticated`: sem `EXECUTE`;
- `service_role`: com `EXECUTE`;
- alerta específico da `distribute_project_leads_v5`: removido do Security Advisor.

## Validações do bloco

- contrato da fase 355: aprovado;
- contrato diretor + distribuição Meta: aprovado;
- fechamento do bloco de distribuição: 9 fases, 9 gates, 9 invariantes e 8 evidências externas aprovadas;
- TypeScript (`tsconfig.active.json`): aprovado;
- ESLint da rota e do novo contrato: aprovado;
- hardening do Supabase vivo: 17/17 verificações aprovadas;
- varredura de segredos: 4.364 arquivos e zero credenciais detectadas;
- auditoria de segurança da aplicação: 6 áreas, 9 gates, 6 cabeçalhos e 6 controles de upload aprovados;
- verificação remota da ACL: aprovada;
- histórico remoto da migration: aprovado.

## Pendências que não foram alteradas nesta fase

O advisor ainda lista quatro funções `SECURITY DEFINER` acessíveis por `authenticated`:

- `create_lead_atomic(...)`;
- `current_organization_id()`;
- `current_user_role()`;
- `mutate_crm_project_v1(...)`.

Essas funções não foram fechadas automaticamente porque podem fazer parte de fluxos legítimos do cliente autenticado. Cada uma precisa de auditoria própria de chamadores, RLS, argumentos, identidade do ator e invariantes antes de qualquer mudança de privilégio.

Também permanecem avisos informativos de tabelas internas com RLS sem policies e o aviso de proteção contra senhas vazadas desabilitada. Eles pertencem ao backlog de segurança e não justificam mudança cega no ambiente em operação.

Referências oficiais:

- [Security Advisor — SECURITY DEFINER executável por authenticated](https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0029_authenticated_security_definer_function_executable)
- [Como revogar execução de funções PostgreSQL](https://supabase.com/docs/guides/troubleshooting/how-can-i-revoke-execution-of-a-postgresql-function-2GYb0A)
- [Proteção da Data API e RLS](https://supabase.com/docs/guides/api/securing-your-api)
- [Proteção contra senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

## Dívida de reconciliação

O banco remoto contém a migration histórica `20260803215759_distribuicao_v5_honra_a_fila`, mas o respectivo arquivo não foi localizado na árvore local. A ausência deve ser reconciliada por inventário de migrations, sem copiar SQL desconhecido nem reaplicar a mudança remota.

## Gate de release

Esta correção remove um risco real sem mudar a operação, mas não libera build, ZIP ou deploy. Continuam obrigatórias:

1. prova autenticada e idempotente da fase 353;
2. baseline factual anterior da fase 350;
3. medição agregada posterior da fase 354;
4. aprovação do gate do ciclo 350–354.

O marcador oficial permanece na fase **349** até essas evidências existirem.
