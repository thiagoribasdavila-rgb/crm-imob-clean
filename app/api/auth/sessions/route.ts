import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { createRequestContext } from "@/lib/api/core";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

function response(body: Record<string, unknown>, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } }); }

export async function GET() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return response({ error: "Sessão expirada." }, 401);
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return response({ error: "Sessão expirada." }, 401);
  const expiresAt = session.expires_at ? new Date(session.expires_at * 1_000) : null;
  return response({ current: { userId: userData.user.id, issuedAt: new Date(session.user.created_at).toISOString(), expiresAt: expiresAt?.toISOString() ?? null, expiresInSeconds: expiresAt ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1_000)) : null, autoRefresh: true }, capabilities: { current: true, others: true, all: true }, tokensReturned: false, deviceEnumerationAvailable: false });
}

export async function POST(request: NextRequest) {
  const meta = createRequestContext(request);
  const rate = checkRateLimit(clientKey(request, "session-control"), { limit: 10, windowMs: 15 * 60_000 });
  if (!rate.allowed) return response({ error: "Muitas ações de sessão. Aguarde alguns minutos." }, 429);
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return response({ error: "Sessão expirada." }, 401);
  const body = await request.json().catch(() => null) as { action?: string } | null;
  const action = body?.action;
  const scope = action === "current" ? "local" : action === "others" ? "others" : action === "all" ? "global" : null;
  if (!scope) return response({ error: "Ação de sessão inválida." }, 400);
  const { error } = await supabase.auth.signOut({ scope });
  if (error) {
    logger.warn("auth.session.revoke_failed", { requestId: meta.requestId, correlationId: meta.correlationId, userId: userData.user.id, action, errorCode: error.code, status: error.status });
    return response({ error: "Não foi possível concluir a revogação agora." }, 400);
  }
  logger.info("auth.session.revoked", { requestId: meta.requestId, correlationId: meta.correlationId, userId: userData.user.id, action });
  return response({ completed: true, action, currentSessionActive: action === "others", tokensReturned: false });
}
