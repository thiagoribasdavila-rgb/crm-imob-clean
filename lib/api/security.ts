import type { NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { apiError, createRequestContext, getClientAddress } from "@/lib/api/core";
import { createClient } from "@/utils/supabase/server";
import { getSupabasePublicConfig } from "@/utils/supabase/env";

type RateBucket = { count: number; resetAt: number };

export type AtlasRole = "admin" | "director" | "superintendent" | "manager" | "broker" | "viewer" | string;
export type CommercialRole = "director" | "superintendent" | "manager" | "broker";

export function resolveCommercialRole(profile: { role: AtlasRole; commercialRole?: AtlasRole | null; commercial_role?: AtlasRole | null }): AtlasRole {
  const commercialRole = profile.commercialRole ?? profile.commercial_role;
  if (commercialRole) return commercialRole;
  return profile.role === "admin" ? "director" : profile.role;
}

export function isDirectorProfile(profile: { role: AtlasRole; commercialRole?: AtlasRole | null; commercial_role?: AtlasRole | null }) {
  return resolveCommercialRole(profile) === "director";
}

type AccessContext = {
  user: {
    id: string;
    email: string | null;
  };
  profile: {
    id: string;
    organizationId: string;
    role: AtlasRole;
    commercialRole: "director" | "superintendent" | "manager" | "broker" | null;
    reportsTo: string | null;
    active: boolean;
  };
  organization: {
    id: string;
    name: string;
    slug: string | null;
    plan: string | null;
    active: boolean;
  };
};

const globalBuckets = globalThis as typeof globalThis & {
  __atlasRateBuckets?: Map<string, RateBucket>;
};

const buckets = globalBuckets.__atlasRateBuckets ?? new Map<string, RateBucket>();
globalBuckets.__atlasRateBuckets = buckets;
const MAX_RATE_BUCKETS = 10_000;

function pruneRateBuckets(now: number) {
  if (buckets.size < MAX_RATE_BUCKETS) return;
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  if (buckets.size < MAX_RATE_BUCKETS) return;
  const overflow = buckets.size - MAX_RATE_BUCKETS + Math.ceil(MAX_RATE_BUCKETS * 0.1);
  const oldest = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt).slice(0, overflow);
  for (const [key] of oldest) buckets.delete(key);
}

export function enforceRateLimit(
  request: NextRequest,
  options: { limit?: number; windowMs?: number; scope?: string } = {},
) {
  const limit = options.limit ?? 60;
  const windowMs = options.windowMs ?? 60_000;
  const scope = options.scope ?? request.nextUrl.pathname;
  const now = Date.now();
  pruneRateBuckets(now);
  const key = `${scope}:${getClientAddress(request)}`;
  const current = buckets.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : current;

  bucket.count += 1;
  buckets.set(key, bucket);

  const remaining = Math.max(0, limit - bucket.count);
  const headers = {
    "RateLimit-Limit": String(limit),
    "RateLimit-Remaining": String(remaining),
    "RateLimit-Reset": String(Math.ceil(bucket.resetAt / 1000)),
  };

  if (bucket.count > limit) {
    const meta = createRequestContext(request);
    return {
      ok: false as const,
      response: apiError("RATE_LIMIT_EXCEEDED", "Limite de requisições excedido.", meta, {
        status: 429,
        headers: { ...headers, "Retry-After": String(Math.ceil((bucket.resetAt - now) / 1000)) },
      }),
    };
  }

  return { ok: true as const, headers };
}

function readBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function requireAuthenticatedUser(request: NextRequest) {
  const meta = createRequestContext(request);
  const bearerToken = readBearerToken(request);

  if (bearerToken) {
    const { url, key } = getSupabasePublicConfig();
    const supabase = createSupabaseClient(url, key, {
      global: { headers: { Authorization: `Bearer ${bearerToken}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await supabase.auth.getUser(bearerToken);

    if (error || !data.user) {
      return {
        ok: false as const,
        response: apiError("UNAUTHENTICATED", "Token de acesso inválido ou expirado.", meta, { status: 401 }),
      };
    }

    return { ok: true as const, user: data.user, supabase, meta, authMode: "bearer" as const };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return {
      ok: false as const,
      response: apiError("UNAUTHENTICATED", "Autenticação necessária.", meta, { status: 401 }),
    };
  }

  return { ok: true as const, user: data.user, supabase, meta, authMode: "cookie" as const };
}

export async function requireAccessContext(
  request: NextRequest,
  options: { roles?: AtlasRole[] } = {},
) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth;

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("id, organization_id, role, commercial_role, reports_to, active")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (profileError) {
    return {
      ok: false as const,
      response: apiError("PROFILE_LOOKUP_FAILED", "Não foi possível validar o perfil do usuário.", auth.meta, {
        status: 500,
      }),
    };
  }

  if (!profile || !profile.organization_id) {
    return {
      ok: false as const,
      response: apiError("PROFILE_REQUIRED", "Perfil organizacional não configurado.", auth.meta, {
        status: 403,
      }),
    };
  }

  if (!profile.active) {
    return {
      ok: false as const,
      response: apiError("PROFILE_INACTIVE", "Este usuário está inativo.", auth.meta, { status: 403 }),
    };
  }

  const { data: organization, error: organizationError } = await auth.supabase
    .from("organizations")
    .select("id, name, slug, plan, active")
    .eq("id", profile.organization_id)
    .maybeSingle();

  if (organizationError) {
    return {
      ok: false as const,
      response: apiError("ORGANIZATION_LOOKUP_FAILED", "Não foi possível validar a organização.", auth.meta, {
        status: 500,
      }),
    };
  }

  if (!organization) {
    return {
      ok: false as const,
      response: apiError("ORGANIZATION_REQUIRED", "Organização não encontrada.", auth.meta, { status: 403 }),
    };
  }

  if (!organization.active) {
    return {
      ok: false as const,
      response: apiError("ORGANIZATION_INACTIVE", "A organização está inativa.", auth.meta, { status: 403 }),
    };
  }

  const effectiveRole = resolveCommercialRole({ role: profile.role, commercial_role: profile.commercial_role });
  if (options.roles?.length && !options.roles.includes(effectiveRole)) {
    return {
      ok: false as const,
      response: apiError("FORBIDDEN", "Permissão insuficiente para esta operação.", auth.meta, { status: 403 }),
    };
  }

  const access: AccessContext = {
    user: {
      id: auth.user.id,
      email: auth.user.email ?? null,
    },
    profile: {
      id: profile.id,
      organizationId: profile.organization_id,
      role: profile.role,
      commercialRole: profile.commercial_role,
      reportsTo: profile.reports_to,
      active: profile.active,
    },
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      plan: organization.plan,
      active: organization.active,
    },
  };

  return {
    ok: true as const,
    user: auth.user,
    supabase: auth.supabase,
    meta: auth.meta,
    authMode: auth.authMode,
    access,
  };
}

export function readIdempotencyKey(request: NextRequest): string | null {
  const value = request.headers.get("idempotency-key")?.trim();
  if (!value) return null;
  return /^[A-Za-z0-9._:-]{8,128}$/.test(value) ? value : null;
}
