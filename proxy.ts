import { NextRequest, NextResponse } from "next/server";
import { refreshSession } from "@/utils/supabase/middleware";

const publicPages = new Set(["/", "/login", "/forgot-password", "/reset-password", "/auth/callback"]);

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const isProtected = !publicPages.has(pathname);

  try {
    return await refreshSession(req, { protect: isProtected });
  } catch (error) {
    console.error("[atlas.proxy] session refresh failed", {
      pathname,
      message: error instanceof Error ? error.message : String(error),
    });

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
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
