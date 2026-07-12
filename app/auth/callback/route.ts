import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";

const allowedOtpTypes = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function safeNextPath(value: string | null, fallback = "/dashboard"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  return value;
}

function authFailureUrl(origin: string, reason: string) {
  const destination = new URL("/forgot-password", origin);
  destination.searchParams.set("error", reason);
  return destination;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const rawType = requestUrl.searchParams.get("type");
  const errorCode = requestUrl.searchParams.get("error_code");
  const errorDescription = requestUrl.searchParams.get("error_description");
  const fallback = rawType === "recovery" ? "/reset-password" : "/dashboard";
  const next = safeNextPath(requestUrl.searchParams.get("next"), fallback);

  if (errorCode || errorDescription) {
    return NextResponse.redirect(authFailureUrl(requestUrl.origin, "recovery_link_invalid"));
  }

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("[atlas.auth.callback] code exchange failed", {
        message: error.message,
        status: error.status,
        code: error.code,
      });
      return NextResponse.redirect(authFailureUrl(requestUrl.origin, "session_exchange_failed"));
    }

    return NextResponse.redirect(new URL(next, requestUrl.origin));
  }

  if (tokenHash && rawType && allowedOtpTypes.has(rawType as EmailOtpType)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: rawType as EmailOtpType,
    });

    if (error) {
      console.error("[atlas.auth.callback] token verification failed", {
        message: error.message,
        status: error.status,
        code: error.code,
        type: rawType,
      });
      return NextResponse.redirect(authFailureUrl(requestUrl.origin, "token_verification_failed"));
    }

    return NextResponse.redirect(new URL(next, requestUrl.origin));
  }

  return NextResponse.redirect(authFailureUrl(requestUrl.origin, "missing_auth_token"));
}
