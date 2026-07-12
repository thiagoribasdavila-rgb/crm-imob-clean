import type { NextRequest } from "next/server";
import { apiError, createRequestContext, getClientAddress } from "@/lib/api/core";
import { createClient } from "@/utils/supabase/server";

type RateBucket = { count: number; resetAt: number };

type AtlasRole = "admin" | "manager" | "broker" | "viewer" | string;

type AccessContext = {
  user: {
    id: string;
    email: string | null;
  };
  profile: {
    id: string;
    organizationId: string;
    role: AtlasRole;
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

export function enforceRateLimit(
  request: NextRequest,
  options: { limit?: number; windowMs?: number; scope?: string } = {},
) {
  const limit = options.limit ?? 60;
  const windowMs = options.windowMs ?? 60_000;
  const scope = options.scope ?? request.nextUrl.pathname;
  const now = Date.now();
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

export async function requireAuthenticatedUser(request: NextRequest) {
  const meta = createRequestContext(request);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return {
      ok: false as const,
      response: apiError("UNAUTHENTICATED", "Autenticação necessária.", meta, { status: 401 }),
    };
  }

  return { ok: true as const, user: data.user, supabase, meta };
}

export async function requireAccessContext(
  request: NextRequest,
  options: { roles?: AtlasRole[] } = {},
) {
  const auth = await requireAuthenticatedUser(request);
  if (!auth.ok) return auth;

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("id, organization_id, role, active")
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

  if (options.roles?.length && !options.roles.includes(profile.role)) {
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
    access,
  };
}

export function readIdempotencyKey(request: NextRequest): string | null {
  const value = request.headers.get("idempotency-key")?.trim();
  if (!value) return null;
  return /^[A-Za-z0-9._:-]{8,128}$/.test(value) ? value : null;
}
