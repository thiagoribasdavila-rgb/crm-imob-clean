import type { NextRequest } from "next/server";
import { apiError } from "@/lib/api/core";
import { requireAccessContext, type AccessRole, type AtlasRole } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { hasPermission, resolveRoleKeys, effectivePermissions, type PermissionKey } from "@/lib/auth/permissions";

export function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim() || null;
  return request.headers.get("x-real-ip") || null;
}

export function userAgentOf(request: NextRequest): string | null {
  return request.headers.get("user-agent")?.slice(0, 512) || null;
}

type AuditEntry = {
  organizationId: string;
  actorId: string | null;
  action: string;
  module: string;
  resourceType?: string | null;
  resourceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
};

// Registro de auditoria — best-effort. Se a tabela audit_logs ainda não foi
// aplicada (migration pendente), NUNCA derruba a requisição; apenas loga.
export async function recordAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    const { error } = await admin.from("audit_logs").insert({
      organization_id: entry.organizationId,
      actor_id: entry.actorId,
      action: entry.action,
      module: entry.module,
      resource_type: entry.resourceType ?? null,
      resource_id: entry.resourceId ?? null,
      ip_address: entry.ip ?? null,
      user_agent: entry.userAgent ?? null,
      metadata: entry.metadata ?? {},
    });
    if (error) logger.warn("audit.persist_skipped", { action: entry.action, module: entry.module, code: error.code });
  } catch (error) {
    logger.warn("audit.persist_failed", { action: entry.action, reason: error instanceof Error ? error.message.slice(0, 120) : "unknown" });
  }
}

// Middleware de autorização granular. Compõe requireAccessContext (auth + org +
// ativo) e então valida a permissão (módulo.ação) SEMPRE no backend. A fonte de
// verdade em runtime é o catálogo em código (não depende das tabelas RBAC novas).
export async function requirePermission(
  request: NextRequest,
  permission: PermissionKey,
  options: { roles?: AtlasRole[]; accessRoles?: AccessRole[] } = {},
) {
  const identity = await requireAccessContext(request, options);
  if (!identity.ok) return identity;

  const profile = identity.access.profile;
  if (!hasPermission(profile, permission)) {
    logger.warn("api.permission_denied", { permission, roleKeys: resolveRoleKeys(profile), profileId: profile.id });
    return {
      ok: false as const,
      response: apiError(
        "PERMISSION_DENIED",
        "Você não tem permissão para esta ação.",
        identity.meta,
        { status: 403 },
      ),
    };
  }
  return identity;
}

export function permissionsForRequestProfile(profile: { accessRole?: string | null; commercialRole?: string | null; role?: string | null }): PermissionKey[] {
  return effectivePermissions(profile);
}
