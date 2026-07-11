import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNextPath(requestUrl.searchParams.get("next"));
  const errorDescription = requestUrl.searchParams.get("error_description");

  if (errorDescription) {
    const destination = new URL("/forgot-password", requestUrl.origin);
    destination.searchParams.set("error", "recovery_link_invalid");
    return NextResponse.redirect(destination);
  }

  if (!code) {
    const destination = new URL("/forgot-password", requestUrl.origin);
    destination.searchParams.set("error", "missing_auth_code");
    return NextResponse.redirect(destination);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const destination = new URL("/forgot-password", requestUrl.origin);
    destination.searchParams.set("error", "session_exchange_failed");
    return NextResponse.redirect(destination);
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
