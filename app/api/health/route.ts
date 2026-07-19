import type { NextRequest } from "next/server";
import { GET as canonicalHealth } from "@/app/api/v1/health/route";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { return canonicalHealth(request); }
