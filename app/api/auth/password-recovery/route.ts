import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { normalizeEmail } from "@/lib/atlas/data-contracts";
import { createRequestContext } from "@/lib/api/core";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

const PRODUCTION_ORIGIN = "https://atlasaios.com.br";

function recoveryOrigin(request: NextRequest) {
  if (process.env.NODE_ENV === "production") return PRODUCTION_ORIGIN;

  const configured = (process.env.ATLAS_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "")
    .trim()
    .replace(/\/$/, "");

  return configured || new URL(request.url).origin;
}

export async function POST(request: NextRequest) {
  const meta = createRequestContext(request);
  const rate = checkRateLimit(clientKey(request, "password-recovery"), {
    limit: 5,
    windowMs: 15 * 60_000,
  });

  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Muitas solicitações. Aguarde alguns minutos." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rate.resetAt - Date.now()) / 1000)),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = normalizeEmail(body?.email);

  if (!email) {
    return NextResponse.json(
      { error: "E-mail inválido." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const origin = recoveryOrigin(request);
  const callbackUrl = `${origin}/auth/callback?next=${encodeURIComponent("/redefinir-senha")}`;
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl,
  });

  if (error && /rate|too many/i.test(error.message)) {
    return NextResponse.json(
      { error: "Muitas solicitações. Aguarde alguns minutos." },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (error) {
    logger.warn("auth.recovery.provider_failed", {
      requestId: meta.requestId,
      correlationId: meta.correlationId,
      errorCode: error.code,
      status: error.status,
    });
  }

  return NextResponse.json(
    { accepted: true, message: "Se o e-mail estiver cadastrado, o link será enviado." },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}
