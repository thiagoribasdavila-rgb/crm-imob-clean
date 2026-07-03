import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(req: NextRequest) {
  const isCRM = req.nextUrl.pathname.startsWith("/crm")

  const token = req.cookies.get("sb-access-token")?.value

  // 🚫 bloqueia CRM sem login
  if (isCRM && !token) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/crm/:path*"],
}
