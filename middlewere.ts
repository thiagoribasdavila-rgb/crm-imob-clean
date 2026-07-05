// middleware.ts
import { NextResponse } from "next/server";

export function middleware(req) {
  const isLogged = req.cookies.get("sb-auth");

  if (!isLogged && req.nextUrl.pathname.startsWith("/crm")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}
