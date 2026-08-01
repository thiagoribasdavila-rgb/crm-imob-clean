import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  ATLAS_LIVE_DEVELOPMENT_WRITE_ADAPTER_VERSION,
  LIVE_DEVELOPMENT_STATUSES,
  LIVE_DEVELOPMENT_WRITABLE_FIELDS,
  canReviewLiveDevelopmentWrite,
  isLiveDevelopmentDatabaseManagerRole,
  preflightLiveDevelopmentWrite,
} from "@/lib/atlas/core-v2";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16_384;

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 60,
    scope: "atlas-core-v2.development-write-preflight.read",
  });
  if (!rate.ok) return rate.response;

  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  if (!canReviewLiveDevelopmentWrite(access.access.profile.role)) {
    return apiError("FORBIDDEN", "Revisão de Projetos disponível para a diretoria.", access.meta, {
      status: 403,
      headers: rate.headers,
    });
  }

  return apiSuccess({
    contract: ATLAS_LIVE_DEVELOPMENT_WRITE_ADAPTER_VERSION,
    source: "public.crm_projects",
    fields: LIVE_DEVELOPMENT_WRITABLE_FIELDS,
    statuses: LIVE_DEVELOPMENT_STATUSES,
    role: {
      reviewAllowed: true,
      liveDatabasePolicyCompatible: isLiveDevelopmentDatabaseManagerRole(access.access.profile.role),
    },
    policy: {
      preflightOnly: true,
      writeEnabled: false,
      mutationExecuted: false,
      authenticatedRlsClient: true,
      persistentAuditRequired: true,
      humanHomologationRequired: true,
    },
  }, access.meta, { headers: rate.headers });
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 20,
    scope: "atlas-core-v2.development-write-preflight.execute",
  });
  if (!rate.ok) return rate.response;

  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;
  if (!canReviewLiveDevelopmentWrite(access.access.profile.role)) {
    return apiError("FORBIDDEN", "Revisão de Projetos disponível para a diretoria.", access.meta, {
      status: 403,
      headers: rate.headers,
    });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return apiError("PROJECT_PREFLIGHT_TOO_LARGE", "Dados de revisão excedem o limite permitido.", access.meta, {
      status: 413,
      headers: rate.headers,
    });
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return apiError("PROJECT_PREFLIGHT_TOO_LARGE", "Dados de revisão excedem o limite permitido.", access.meta, {
      status: 413,
      headers: rate.headers,
    });
  }

  const body = rawBody ? (() => {
    try {
      return JSON.parse(rawBody) as unknown;
    } catch {
      return null;
    }
  })() : null;
  if (!body) {
    return apiError("PROJECT_PREFLIGHT_INVALID", "Dados de revisão não informados.", access.meta, {
      status: 400,
      headers: rate.headers,
    });
  }

  const result = await preflightLiveDevelopmentWrite(access.supabase, {
    body,
    organizationId: access.access.organization.id,
    actorRole: access.access.profile.role,
  });

  structuredApiLog("info", "atlas_core_v2.development_write_preflight", request, access.meta, {
    organizationId: access.access.organization.id,
    actorId: access.access.profile.id,
    operation: result.operation,
    changedFields: result.changedFields,
    issueCodes: result.issues.map((item) => item.code),
    activationBlockers: result.activationBlockers,
    readyForHomologation: result.readyForHomologation,
    mutationExecuted: result.mutationExecuted,
  });

  if (!result.databaseAvailable) {
    return apiError("PROJECT_PREFLIGHT_UNAVAILABLE", "Não foi possível validar o projeto agora.", access.meta, {
      status: 503,
      headers: rate.headers,
    });
  }

  return apiSuccess(result, access.meta, { headers: rate.headers });
}
