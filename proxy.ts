import { NextRequest, NextResponse } from "next/server";
import { refreshSession } from "@/utils/supabase/middleware";

const protectedPrefixes = [
  "/crm",
  "/dashboard",
  "/leads",
  "/pipeline",
  "/developments",
  "/tasks",
  "/marketing",
  "/atlas-v2",
  "/atlas-v3",
  "/atlas-2030",
];

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

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
  matcher: [
    "/login",
    "/crm/:path*",
    "/dashboard/:path*",
    "/leads/:path*",
    "/pipeline/:path*",
    "/developments/:path*",
    "/tasks/:path*",
    "/marketing/:path*",
    "/atlas-v2/:path*",
    "/atlas-v3/:path*",
    "/atlas-2030/:path*",
  ],
};
