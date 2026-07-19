import { NextRequest, NextResponse } from "next/server";
import { refreshSession } from "@/utils/supabase/middleware";

const publicPages = new Set(["/", "/login", "/forgot-password", "/reset-password", "/auth/callback"]);

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const isProtected = !publicPages.has(pathname);

  try {
    return await refreshSession(req, { protect: isProtected });
  } catch (error) {
    console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: "warn", event: "auth.proxy.session_refresh_failed", service: "atlas-ai-os", requestId: req.headers.get("x-request-id") || "proxy", correlationId: req.headers.get("x-correlation-id") || req.headers.get("x-request-id") || "proxy", pathname, errorType: error instanceof Error ? error.name : "unknown" }));

    if (isProtected) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("next", `${pathname}${req.nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.[^/]+$).*)"],
};
