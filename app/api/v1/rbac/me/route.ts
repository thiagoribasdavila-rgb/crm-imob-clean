import type { NextRequest } from "next/server";
import { apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { clientIp, userAgentOf, recordAuditLog } from "@/lib/api/authorization";
import { effectivePermissions, resolveRoleKeys, ROLE_LABELS } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

// Retorna os papéis e as permissões efetivas do usuário autenticado. Toda
// decisão de acesso é validada no backend a partir deste modelo (nunca no front).
export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "rbac.me" });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;

  const profile = identity.access.profile;
  const roleKeys = resolveRoleKeys(profile);
  const permissions = effectivePermissions(profile);

  await recordAuditLog({
    organizationId: identity.access.organization.id,
    actorId: profile.id,
    action: "rbac.me.view",
    module: "rbac",
    ip: clientIp(request),
    userAgent: userAgentOf(request),
    metadata: { roleKeys },
  });

  return apiSuccess(
    {
      profileId: profile.id,
      legacy: { role: profile.role, accessRole: profile.accessRole, commercialRole: profile.commercialRole },
      roles: roleKeys.map((key) => ({ key, label: ROLE_LABELS[key] })),
      permissions,
      /**
       * ── ESTE CAMPO DIZIA `true` E ERA MENTIRA ──────────────────────────
       *
       * Medido em 2026-07-27: `requirePermission` — a função que aplicaria a
       * matriz `ROLE_PERMISSIONS` — tem ZERO chamadas em todo o produto. A
       * lista de `permissions` acima NÃO é o que o backend usa para decidir.
       *
       * O que decide de verdade são checagens escritas à mão dentro de cada
       * rota, e elas FUNCIONAM: medido com o token de um corretor real,
       * /api/v1/team, /api/v1/analytics/director-daily e /api/v2/approvals
       * devolvem 403. Ninguém está desprotegido.
       *
       * O problema é que as duas listas DIVERGEM. Medido: em
       * `lib/auth/permissions.ts`, o papel `corretor` NÃO recebe
       * `leads.export` — mas a rota de exportação atende o corretor, limitando
       * ao que é dele. Quem confiasse em `backendEnforced: true` para esconder
       * o botão de exportar esconderia um botão que funciona.
       *
       * A matriz ainda usa chaves em PORTUGUÊS (`corretor`, `diretor`,
       * `gerente`) enquanto os perfis gravam em inglês (`broker`, `director`,
       * `manager`) — outra razão para não tratá-la como fonte de autorização
       * sem antes reconciliar os dois vocabulários.
       *
       * Dizer a verdade custa nada e evita a decisão errada. Aplicar a matriz
       * de fato é mudança de controle de acesso: merece sessão própria, com o
       * corretor já trabalhando, não a véspera.
       */
      enforcement: {
        /** A matriz é aplicada automaticamente pelo backend? Não. */
        matrizAplicada: false,
        /** O que realmente barra: checagem por rota, verificada com login real. */
        comoEhAplicado: "checagem por rota",
        /** Para que serve a lista acima: pintar a interface, não autorizar. */
        useAPermissionsPara: "orientar a interface — o backend decide por conta própria e pode divergir",
      },
      /** @deprecated Dizia `true` sem sustentação. Use `enforcement`. */
      backendEnforced: false,
    },
    identity.meta,
    { headers: rate.headers },
  );
}
