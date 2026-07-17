import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { createRequestContext } from "@/lib/api/core";
import { logger } from "@/lib/observability/logger";
import { safeAuthDestination } from "@/lib/auth/safe-redirect";

const allowedOtpTypes = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function authFailureUrl(origin: string, reason: string) {
  const destination = new URL("/forgot-password", origin);
  destination.searchParams.set("error", reason);
  return destination;
}

function publicOrigin(request: NextRequest) {
  const configured = (process.env.ATLAS_BASE_URL || process.env.NEXT_PUBLIC_APP_URL)?.trim().replace(/\/$/, "");
  if (configured) return configured;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") || "https";
  return host ? `${protocol}://${host}` : new URL(request.url).origin;
}

export async function GET(request: NextRequest) {
  const meta = createRequestContext(request);
  const requestUrl = new URL(request.url);
  const origin = publicOrigin(request);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const rawType = requestUrl.searchParams.get("type");
  const errorCode = requestUrl.searchParams.get("error_code");
  const errorDescription = requestUrl.searchParams.get("error_description");
  const fallback = rawType === "recovery" ? "/reset-password" : "/dashboard";
  const next = safeAuthDestination(requestUrl.searchParams.get("next"), fallback);
  const recoveryFlow = rawType === "recovery" || next === "/reset-password";

  if (errorCode || errorDescription) {
    return NextResponse.redirect(authFailureUrl(origin, "recovery_link_invalid"));
  }

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      logger.warn("auth.callback.code_exchange_failed", { requestId: meta.requestId, correlationId: meta.correlationId, status: error.status, errorCode: error.code });
      return NextResponse.redirect(authFailureUrl(origin, "session_exchange_failed"));
    }

    const response = NextResponse.redirect(new URL(next, origin));
    response.headers.set("Cache-Control", "no-store");
    if (recoveryFlow) response.cookies.set("atlas-recovery-intent", crypto.randomUUID(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 15 * 60 });
    return response;
  }

  if (tokenHash && rawType && allowedOtpTypes.has(rawType as EmailOtpType)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: rawType as EmailOtpType,
    });

    if (error) {
      logger.warn("auth.callback.token_verification_failed", { requestId: meta.requestId, correlationId: meta.correlationId, status: error.status, errorCode: error.code, otpType: rawType });
      return NextResponse.redirect(authFailureUrl(origin, "token_verification_failed"));
    }

    const response = NextResponse.redirect(new URL(next, origin));
    response.headers.set("Cache-Control", "no-store");
    if (recoveryFlow) response.cookies.set("atlas-recovery-intent", crypto.randomUUID(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 15 * 60 });
    return response;
  }

  return NextResponse.redirect(authFailureUrl(origin, "missing_auth_token"));
}
