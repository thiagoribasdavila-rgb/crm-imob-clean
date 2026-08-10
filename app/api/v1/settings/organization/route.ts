import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function canManageOrganization(accessRole: string, commercialRole: string | null) {
  return accessRole === "admin" || commercialRole === "director";
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 60,
    windowMs: 60_000,
    scope: "settings.organization.read",
  });
  if (!rate.ok) return rate.response;

  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  return apiSuccess({
    organization: {
      id: access.access.organization.id,
      name: access.access.organization.name,
      slug: access.access.organization.slug,
      plan: access.access.organization.plan,
      active: access.access.organization.active,
    },
    permissions: {
      canEdit: canManageOrganization(
        access.access.profile.accessRole,
        access.access.profile.commercialRole,
      ),
      audited: true,
      humanApprovalRequired: true,
    },
  }, access.meta, { headers: rate.headers });
}

export async function PATCH(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 10,
    windowMs: 60_000,
    scope: "settings.organization.write",
  });
  if (!rate.ok) return rate.response;

  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  if (!canManageOrganization(
    access.access.profile.accessRole,
    access.access.profile.commercialRole,
  )) {
    return apiError(
      "FORBIDDEN",
      "Somente a administração e a diretoria podem alterar a identidade da organização.",
      access.meta,
      { status: 403, headers: rate.headers },
    );
  }

  const body = await request.json().catch(() => null) as {
    name?: unknown;
    slug?: unknown;
  } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const slug = typeof body?.slug === "string"
    ? body.slug.trim().toLocaleLowerCase("pt-BR")
    : "";

  if (name.length < 2 || name.length > 120) {
    return apiError(
      "INVALID_ORGANIZATION_NAME",
      "Informe um nome entre 2 e 120 caracteres.",
      access.meta,
      { status: 400, headers: rate.headers },
    );
  }
  if (slug && (slug.length < 2 || slug.length > 80 || !slugPattern.test(slug))) {
    return apiError(
      "INVALID_ORGANIZATION_SLUG",
      "O identificador deve usar apenas letras minúsculas, números e hífens.",
      access.meta,
      { status: 400, headers: rate.headers },
    );
  }

  const admin = getSupabaseAdmin();
  const organizationId = access.access.organization.id;
  const previous = {
    name: access.access.organization.name,
    slug: access.access.organization.slug,
  };
  const nextSlug = slug || null;

  if (previous.name === name && previous.slug === nextSlug) {
    return apiSuccess({
      organization: {
        id: organizationId,
        name: previous.name,
        slug: previous.slug,
        plan: access.access.organization.plan,
        active: access.access.organization.active,
      },
      changedFields: [],
      audited: true,
      unchanged: true,
    }, access.meta, { headers: rate.headers });
  }

  if (slug) {
    const duplicate = await admin
      .from("organizations")
      .select("id", { head: true, count: "exact" })
      .eq("slug", slug)
      .neq("id", organizationId);
    if (duplicate.error) {
      structuredApiLog("error", "settings.organization_slug_check_failed", request, access.meta, {
        organizationId,
        message: duplicate.error.message,
      });
      return apiError(
        "ORGANIZATION_SAVE_UNAVAILABLE",
        "Não foi possível validar o identificador agora.",
        access.meta,
        { status: 503, headers: rate.headers },
      );
    }
    if ((duplicate.count ?? 0) > 0) {
      return apiError(
        "ORGANIZATION_SLUG_IN_USE",
        "Esse identificador já está em uso.",
        access.meta,
        { status: 409, headers: rate.headers },
      );
    }
  }

  const update = await admin
    .from("organizations")
    .update({ name, slug: slug || null })
    .eq("id", organizationId)
    .select("id,name,slug,plan,active")
    .single();
  if (update.error) {
    structuredApiLog("error", "settings.organization_update_failed", request, access.meta, {
      organizationId,
      message: update.error.message,
    });
    return apiError(
      "ORGANIZATION_SAVE_FAILED",
      "Não foi possível salvar a organização.",
      access.meta,
      { status: 503, headers: rate.headers },
    );
  }

  const changedFields = [
    previous.name === name ? null : "name",
    previous.slug === nextSlug ? null : "slug",
  ].filter(Boolean);
  const audit = await admin.from("atlas_events").insert({
    organization_id: organizationId,
    event_type: "organization.settings_updated",
    source: "atlas-settings",
    aggregate_type: "organization",
    aggregate_id: organizationId,
    payload: {
      actorId: access.access.profile.id,
      changedFields,
    },
    correlation_id: access.meta.correlationId,
  });
  if (audit.error) {
    const rollback = await admin
      .from("organizations")
      .update(previous)
      .eq("id", organizationId);
    structuredApiLog("error", "settings.organization_audit_failed", request, access.meta, {
      organizationId,
      auditMessage: audit.error.message,
      rollbackSucceeded: !rollback.error,
      rollbackMessage: rollback.error?.message,
    });
    return apiError(
      "ORGANIZATION_AUDIT_FAILED",
      rollback.error
        ? "A alteração não pôde ser auditada e requer revisão administrativa."
        : "A alteração foi desfeita porque a auditoria não estava disponível.",
      access.meta,
      { status: 503, headers: rate.headers },
    );
  }

  structuredApiLog("info", "settings.organization_updated", request, access.meta, {
    organizationId,
    actorId: access.access.profile.id,
    changedFields,
  });
  return apiSuccess({
    organization: update.data,
    changedFields,
    audited: true,
  }, access.meta, { headers: rate.headers });
}
