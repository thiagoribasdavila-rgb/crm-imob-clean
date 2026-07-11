import { NextRequest, NextResponse } from "next/server";
import { refreshSession } from "@/utils/supabase/middleware";

export async function proxy(req: NextRequest) {
  const isLoginPage = req.nextUrl.pathname.startsWith("/login");

  if (isLoginPage) {
    return refreshSession(req);
  }

  try {
    return await refreshSession(req);
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/crm/:path*", "/dashboard/:path*", "/leads/:path*", "/pipeline/:path*", "/developments/:path*", "/tasks/:path*", "/marketing/:path*", "/atlas-v2/:path*", "/atlas-v3/:path*", "/atlas-2030/:path*"],
};
