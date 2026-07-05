import { NextResponse } from "next/server";

export function middleware(req: any) {
  const isLoginPage = req.nextUrl.pathname.startsWith("/login");

  if (isLoginPage) {
    return NextResponse.next();
  }

  // 🔥 futuro: validar cookie Supabase aqui
  return NextResponse.next();
}

export const config = {
  matcher: ["/crm/:path*", "/dashboard/:path*"],
};
