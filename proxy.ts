import { NextRequest, NextResponse } from "next/server";

export function proxy(req: NextRequest) {
  const isLoginPage = req.nextUrl.pathname.startsWith("/login");

  if (isLoginPage) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/crm/:path*", "/dashboard/:path*"],
};
