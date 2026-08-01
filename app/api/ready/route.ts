import type { NextRequest } from "next/server";
import { GET as canonicalReady } from "@/app/api/v1/ready/route";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { return canonicalReady(request); }
