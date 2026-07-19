# RBAC Enterprise (modelo híbrido) — Fase 10

## Decisão de arquitetura

Adotado o padrão **Hybrid RBAC Enterprise**: catálogo de permissões **versionado em código** como fonte de verdade em runtime, com **estrutura de banco preparada** para permissões configuráveis por organização no futuro (overrides). Aditivo e **não-destrutivo** — complementa o RBAC legado (`profiles.role/commercial_role/access_role` + RLS + guard), sem substituí-lo nem migrar usuários.

Motivo de não forçar os papéis novos no enum legado: as tabelas-base (`profiles` e seu `CHECK` de `commercial_role`) vivem no projeto Supabase remoto, fora das migrations. Modelar papéis na nova tabela `user_roles` evita quebrar o enum existente.

## Modelo

- **Catálogo em código:** `lib/auth/permissions.ts` — permissões `modulo.acao`, papéis (`RoleKey`), matriz padrão `ROLE_PERMISSIONS`, e a ponte `resolveRoleKeys(profile)` que mapeia os papéis legados para os novos sem migração. `hasPermission()` / `effectivePermissions()` são a checagem de runtime.
- **Middleware:** `lib/api/authorization.ts` — `requirePermission(request, "modulo.acao")` compõe `requireAccessContext` (auth + organização + ativo) e valida a permissão **sempre no backend**. Inclui `clientIp()`, `userAgentOf()` e `recordAuditLog()` (best-effort).
- **Banco (preparado):** `supabase/migrations/20260720010000_rbac_enterprise_foundation.sql` — tabelas `roles`, `permissions`, `role_permissions`, `user_roles`, `audit_logs`, com RLS org-scoped, grants e seed dos papéis de sistema + catálogo + matriz padrão.

## Papéis de sistema

`admin_master` · `diretor` · `gerente` · `corretor` · `marketing` · `incorporadora` · `ia_agent`.
Os quatro primeiros são resolvidos automaticamente a partir dos papéis legados; `marketing`, `incorporadora` e `ia_agent` são atribuídos explicitamente via `user_roles` (próxima fase). Níveis de autonomia do `ia_agent` (`read_only`/`assistant`/`operational`/`supervised_autonomous`) já estão definidos em código, reservados para a governança de IA configurável.

## Permissões (módulo × ação)

`leads` (view, view_team, create, edit, assign, transfer, import, export) · `clients` (view, edit, history, documents) · `users` (view, create, edit, delete) · `projects` (view, create, edit, publish) · `campaigns` (view, create, manage, pause) · `reports` (view, create, export) · `financial` (view, edit, approve) · `ai` (use, configure, train, manage) · `integrations` (view, manage) · `settings` (view, manage) · `audit` (view).

## Auditoria com IP

`audit_logs` grava organização, ator, ação, módulo, recurso, **IP**, **user-agent**, metadata e timestamp. `recordAuditLog()` é **best-effort**: se a migration ainda não foi aplicada, apenas loga e nunca derruba a requisição.

## Prova de ponta a ponta

`GET /api/v1/rbac/me` retorna os papéis e as permissões efetivas do usuário autenticado (validado no backend) e grava um registro de auditoria com IP/user-agent.

## Rollout (próximas etapas)

1. **Aplicar a migration** no Supabase de homologação (`supabase db push` ou fluxo de migrations). Enquanto não aplicada, o runtime segue 100% funcional pelo catálogo em código; a auditoria fica em modo best-effort.
2. **Adoção incremental** de `requirePermission("modulo.acao")` nas rotas existentes, de forma conservadora (superset do comportamento atual, para não quebrar acessos que já funcionam). Prioridade: gestão de usuários, exportações, financeiro, configurações e integrações.
3. **Ativar overrides de banco** (hybrid): fazer o middleware consultar `role_permissions`/`user_roles` como sobrescrita opcional do catálogo, com fallback seguro para o código.
4. **UI de administração** de papéis/permissões para o Admin Master.

## Segurança

- Toda permissão é validada no **backend**; o frontend nunca é a fonte de autorização.
- RLS org-scoped em todas as tabelas novas; `audit_logs` legível apenas por diretoria/admin.
- Nada foi alterado nas tabelas existentes; o guard legado continua ativo.
