import { NextResponse } from "next/server";
import { requireApiIdentity } from "@/lib/security/api-auth";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import type { MemoryRecord } from "@/lib/atlas2030/contracts";

export const dynamic = "force-dynamic";

type Payload = MemoryRecord & { source?: string };

export async function POST(request: Request) {
  const rate = checkRateLimit(clientKey(request, "atlas2030-memory-write"), { limit: 90, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Limite de gravação de memória excedido." },
      { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))) } },
    );
  }

  try {
    const identity = await requireApiIdentity(request);
    const body = (await request.json()) as Payload;
    if (!body.scopeType || !body.memoryType?.trim() || !body.content || typeof body.content !== "object") {
      return NextResponse.json({ error: "scopeType, memoryType e content são obrigatórios." }, { status: 400 });
    }

    const importance = Math.min(100, Math.max(0, Number(body.importance ?? 50)));
    const confidence = Math.min(100, Math.max(0, Number(body.confidence ?? 70)));
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("atlas_memories")
      .insert({
        organization_id: identity.organizationId,
        scope_type: body.scopeType,
        scope_id: body.scopeId ?? null,
        memory_type: body.memoryType.trim(),
        content: body.content,
        importance,
        confidence,
        source: body.source ?? "atlas-api",
        expires_at: body.expiresAt ?? null,
        created_by: identity.userId,
      })
      .select("id,created_at")
      .single();

    if (error) throw error;
    logger.info("atlas2030.memory_written", { memoryId: data.id, scopeType: body.scopeType, organizationId: identity.organizationId });
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    logger.error("atlas2030.memory_write_failed", error);
    const message = error instanceof Error ? error.message : "Falha ao gravar memória.";
    const status = /token|sessão|autoriz/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
