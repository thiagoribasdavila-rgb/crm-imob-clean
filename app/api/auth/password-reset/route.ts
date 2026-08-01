import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { createRequestContext } from "@/lib/api/core";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";
const RECOVERY_COOKIE = "atlas-recovery-intent";

function recoveryResponse(body: Record<string, unknown>, status = 200, clearIntent = false) {
  const response = NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (clearIntent || body.updated) response.cookies.set(RECOVERY_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}

async function verifiedRecovery(request: NextRequest) {
  if (!request.cookies.get(RECOVERY_COOKIE)?.value) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  return !error && data.user ? { supabase, user: data.user } : null;
}

export async function GET(request: NextRequest) {
  const recovery = await verifiedRecovery(request);
  return recovery ? recoveryResponse({ ready: true }) : recoveryResponse({ ready: false }, 401, true);
}

export async function POST(request: NextRequest) {
  const meta = createRequestContext(request);
  const rate = checkRateLimit(clientKey(request, "password-reset"), { limit: 5, windowMs: 15 * 60_000 });
  if (!rate.allowed) return recoveryResponse({ error: "Muitas tentativas. Solicite um novo link em alguns minutos." }, 429);
  const recovery = await verifiedRecovery(request);
  if (!recovery) return recoveryResponse({ error: "O link expirou ou já foi utilizado. Solicite um novo link." }, 401, true);
  const body = await request.json().catch(() => null) as { password?: string } | null;
  const password = String(body?.password || "");
  const categories = [/[a-z]/.test(password), /[A-Z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length;
  if (password.length < 12 || password.length > 128 || categories < 3) return recoveryResponse({ error: "Use 12 a 128 caracteres e combine ao menos três tipos: maiúsculas, minúsculas, números e símbolos." }, 400);
  const { error } = await recovery.supabase.auth.updateUser({ password });
  if (error) {
    logger.warn("auth.recovery.password_update_failed", { requestId: meta.requestId, correlationId: meta.correlationId, errorCode: error.code, status: error.status });
    return recoveryResponse({ error: "Não foi possível atualizar a senha. Solicite um novo link de recuperação." }, 400);
  }
  await recovery.supabase.auth.signOut({ scope: "global" });
  logger.info("auth.recovery.password_updated", { requestId: meta.requestId, correlationId: meta.correlationId, userId: recovery.user.id });
  return recoveryResponse({ updated: true });
}
