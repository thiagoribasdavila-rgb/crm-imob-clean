import type { NextRequest } from "next/server";
import { apiError, createRequestContext, getClientAddress } from "@/lib/api/core";
import { createClient } from "@/utils/supabase/server";

type RateBucket = { count: number; resetAt: number };

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

export function readIdempotencyKey(request: NextRequest): string | null {
  const value = request.headers.get("idempotency-key")?.trim();
  if (!value) return null;
  return /^[A-Za-z0-9._:-]{8,128}$/.test(value) ? value : null;
}
