import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getSupabasePublicConfig } from "./env";

export async function refreshSession(request: NextRequest, options?: { protect?: boolean }) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const { url, key } = getSupabasePublicConfig();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options: cookieOptions }) =>
          response.cookies.set(name, value, cookieOptions),
        );
      },
    },
  });

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const authenticated = !claimsError && typeof claimsData?.claims?.sub === "string" && claimsData.claims.sub.length > 0;

  if (options?.protect && !authenticated) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (request.nextUrl.pathname.startsWith("/login") && authenticated) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}
