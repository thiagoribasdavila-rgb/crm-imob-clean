import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { clientKey } from "@/lib/security/rate-limit";
import { logger } from "@/lib/observability/logger";

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function enforceDistributedRateLimit(
  request: Request,
  options: { scope: string; limit: number; windowSeconds: number },
) {
  const keyHash = sha256(clientKey(request, options.scope));
  const { data, error } = await getSupabaseAdmin().rpc("consume_api_rate_limit", {
    p_scope: options.scope,
    p_key_hash: keyHash,
    p_limit: options.limit,
    p_window_seconds: options.windowSeconds,
  });
  if (error) {
    logger.error("api.rate_limit_unavailable", error, { scope: options.scope });
    return { allowed: false as const, response: NextResponse.json({ error: "Proteção contra abuso indisponível." }, { status: 503 }) };
  }
  const result = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean; remaining?: number; reset_at?: string } | null;
  const resetAt = result?.reset_at ? new Date(result.reset_at).getTime() : Date.now() + options.windowSeconds * 1000;
  const headers = {
    "RateLimit-Limit": String(options.limit),
    "RateLimit-Remaining": String(Math.max(0, Number(result?.remaining ?? 0))),
    "RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
  };
  if (!result?.allowed) {
    logger.warn("api.rate_limited", { scope: options.scope });
    return { allowed: false as const, response: NextResponse.json({ error: "Limite de requisições excedido." }, { status: 429, headers: { ...headers, "Retry-After": String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))) } }) };
  }
  return { allowed: true as const, headers };
}

export function requestFingerprint(payload: unknown) {
  return sha256(JSON.stringify(payload));
}

export async function claimIdempotency(input: { organizationId: string; scope: string; key: string | null; requestHash: string }) {
  if (!input.key || !/^[A-Za-z0-9._:-]{8,128}$/.test(input.key)) {
    return { state: "invalid" as const, response: NextResponse.json({ error: "Idempotency-Key válido é obrigatório." }, { status: 400 }) };
  }
  const { data, error } = await getSupabaseAdmin().rpc("claim_api_idempotency", {
    p_organization_id: input.organizationId,
    p_scope: input.scope,
    p_key: input.key,
    p_request_hash: input.requestHash,
    p_lock_seconds: 60,
  });
  if (error) return { state: "unavailable" as const, response: NextResponse.json({ error: "Proteção de repetição indisponível." }, { status: 503 }) };
  const row = (Array.isArray(data) ? data[0] : data) as { state: "claimed" | "replay" | "processing" | "conflict"; response_status?: number; response_body?: unknown };
  if (row.state === "replay") return { state: row.state, response: NextResponse.json(row.response_body, { status: row.response_status || 200, headers: { "Idempotency-Replayed": "true" } }) };
  if (row.state === "conflict") return { state: row.state, response: NextResponse.json({ error: "A chave já foi usada com outro conteúdo." }, { status: 409 }) };
  if (row.state === "processing") return { state: row.state, response: NextResponse.json({ error: "A mesma operação já está em processamento." }, { status: 409, headers: { "Retry-After": "2" } }) };
  return { state: "claimed" as const, key: input.key };
}

export async function completeIdempotency(input: { organizationId: string; scope: string; key: string; requestHash: string; status: number; body: unknown }) {
  const { error } = await getSupabaseAdmin().rpc("complete_api_idempotency", {
    p_organization_id: input.organizationId,
    p_scope: input.scope,
    p_key: input.key,
    p_request_hash: input.requestHash,
    p_response_status: input.status,
    p_response_body: input.body,
  });
  if (error) logger.error("api.idempotency_completion_failed", error, { scope: input.scope });
}
