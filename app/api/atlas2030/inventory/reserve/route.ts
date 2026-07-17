import { NextResponse } from "next/server";
import { requireApiIdentity } from "@/lib/security/api-auth";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

type Payload = {
  propertyId?: string;
  customerId?: string;
  leadId?: string;
  holdMinutes?: number;
  source?: string;
  metadata?: Record<string, unknown>;
};

export async function POST(request: Request) {
  const rate = checkRateLimit(clientKey(request, "atlas2030-inventory-reserve"), { limit: 20, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: "Limite de reservas excedido." }, { status: 429 });

  try {
    const identity = await requireApiIdentity(request);
    const body = (await request.json()) as Payload;
    if (!body.propertyId) return NextResponse.json({ error: "propertyId é obrigatório." }, { status: 400 });

    const admin = getSupabaseAdmin();
    const { data: property, error: propertyError } = await admin
      .from("properties")
      .select("id,status")
      .eq("id", body.propertyId)
      .eq("organization_id", identity.organizationId)
      .single();

    if (propertyError || !property) return NextResponse.json({ error: "Unidade não encontrada." }, { status: 404 });
    if (!["available", "disponivel", "active", "ativo"].includes(String(property.status).toLowerCase())) {
      return NextResponse.json({ error: "Unidade indisponível para reserva." }, { status: 409 });
    }

    if (body.customerId) {
      const { data: customer, error: customerError } = await admin
        .from("customers")
        .select("id")
        .eq("id", body.customerId)
        .eq("organization_id", identity.organizationId)
        .maybeSingle();

      if (customerError) throw customerError;
      if (!customer) {
        return NextResponse.json(
          { error: "Cliente inexistente ou fora da sua empresa." },
          { status: 403 },
        );
      }
    }

    if (body.leadId) {
      const { data: lead, error: leadError } = await identity.supabase
        .from("leads")
        .select("id")
        .eq("id", body.leadId)
        .eq("organization_id", identity.organizationId)
        .maybeSingle();

      if (leadError) throw leadError;
      if (!lead) {
        return NextResponse.json(
          { error: "Lead inexistente ou fora do seu escopo comercial." },
          { status: 403 },
        );
      }
    }

    const holdMinutes = Math.min(1440, Math.max(5, Number(body.holdMinutes ?? 30)));
    const holdExpiresAt = new Date(Date.now() + holdMinutes * 60_000).toISOString();
    const { data, error } = await admin
      .from("atlas_inventory_reservations")
      .insert({
        organization_id: identity.organizationId,
        property_id: body.propertyId,
        customer_id: body.customerId ?? null,
        lead_id: body.leadId ?? null,
        status: "held",
        hold_expires_at: holdExpiresAt,
        source: body.source ?? "atlas2030",
        metadata: body.metadata ?? {},
        created_by: identity.userId,
      })
      .select("id,status,hold_expires_at,created_at")
      .single();

    if (error?.code === "23505") return NextResponse.json({ error: "Unidade já possui reserva ativa." }, { status: 409 });
    if (error) throw error;

    await admin.from("atlas_events").insert({
      organization_id: identity.organizationId,
      event_type: "inventory.reserved",
      source: "atlas2030.inventory",
      aggregate_type: "property",
      aggregate_id: body.propertyId,
      payload: { reservationId: data.id, holdExpiresAt, leadId: body.leadId ?? null, customerId: body.customerId ?? null },
      correlation_id: crypto.randomUUID(),
    });

    logger.info("atlas2030.inventory_reserved", { reservationId: data.id, propertyId: body.propertyId, organizationId: identity.organizationId });
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    logger.error("atlas2030.inventory_reserve_failed", error);
    const message = error instanceof Error ? error.message : "Falha ao reservar unidade.";
    const status = /token|sessão|autoriz/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
