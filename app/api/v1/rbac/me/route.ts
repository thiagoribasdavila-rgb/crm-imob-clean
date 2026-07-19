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
      backendEnforced: true,
    },
    identity.meta,
    { headers: rate.headers },
  );
}
