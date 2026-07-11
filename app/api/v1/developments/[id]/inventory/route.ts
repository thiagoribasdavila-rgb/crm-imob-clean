import { NextResponse } from "next/server";
import { requireApiIdentity } from "@/lib/security/api-auth";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

type UpdatePayload = {
  propertyId?: string;
  status?: string;
  price?: number | null;
};

const allowedStatuses = new Set(["available", "disponivel", "reserved", "reservado", "sold", "vendido", "blocked", "bloqueado", "active", "ativo"]);

function authFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "Não autorizado.";
  const status = /token|sessão|autenticação|organização/i.test(message) ? 401 : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request, context: RouteContext) {
  const rate = checkRateLimit(clientKey(request, "v1-development-inventory-read"), { limit: 120, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: "Limite de consulta excedido." }, { status: 429 });

  try {
    const identity = await requireApiIdentity(request);
    const { id } = await context.params;
    const admin = getSupabaseAdmin();

    const [developmentResult, inventoryResult, reservationsResult] = await Promise.all([
      admin
        .from("developments")
        .select("id,name,developer_name,neighborhood,city,state,status")
        .eq("id", id)
        .eq("organization_id", identity.organizationId)
        .single(),
      admin
        .from("properties")
        .select("id,title,unit_number,floor,typology,price,area,bedrooms,bathrooms,parking_spaces,status,updated_at")
        .eq("development_id", id)
        .eq("organization_id", identity.organizationId)
        .order("floor", { ascending: true })
        .order("unit_number", { ascending: true }),
      admin
        .from("atlas_inventory_reservations")
        .select("id,property_id,status,hold_expires_at,lead_id,customer_id,created_at")
        .eq("organization_id", identity.organizationId)
        .in("status", ["held", "confirmed"])
        .gt("hold_expires_at", new Date().toISOString()),
    ]);

    if (developmentResult.error || !developmentResult.data) {
      return NextResponse.json({ error: "Empreendimento não encontrado." }, { status: 404 });
    }

    const reservations = reservationsResult.data ?? [];
    const reservationByProperty = new Map(reservations.map((reservation) => [reservation.property_id, reservation]));
    const inventory = (inventoryResult.data ?? []).map((property) => ({
      ...property,
      activeReservation: reservationByProperty.get(property.id) ?? null,
    }));

    const metrics = inventory.reduce(
      (acc, property) => {
        const normalized = String(property.status ?? "available").toLowerCase();
        const isReserved = Boolean(property.activeReservation) || ["reserved", "reservado"].includes(normalized);
        const isSold = ["sold", "vendido"].includes(normalized);
        const isAvailable = !isReserved && !isSold && !["blocked", "bloqueado"].includes(normalized);
        acc.total += 1;
        acc.totalVgv += Number(property.price ?? 0);
        if (isReserved) acc.reserved += 1;
        else if (isSold) { acc.sold += 1; acc.soldVgv += Number(property.price ?? 0); }
        else if (isAvailable) acc.available += 1;
        else acc.blocked += 1;
        return acc;
      },
      { total: 0, available: 0, reserved: 0, sold: 0, blocked: 0, totalVgv: 0, soldVgv: 0 },
    );

    return NextResponse.json({
      development: developmentResult.data,
      inventory,
      metrics: {
        ...metrics,
        absorption: metrics.total ? Math.round((metrics.sold / metrics.total) * 100) : 0,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.warn("launch_os.inventory_read_failed", { error: error instanceof Error ? error.message : String(error) });
    return authFailure(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const rate = checkRateLimit(clientKey(request, "v1-development-inventory-update"), { limit: 40, windowMs: 60_000 });
  if (!rate.allowed) return NextResponse.json({ error: "Limite de alterações excedido." }, { status: 429 });

  try {
    const identity = await requireApiIdentity(request);
    const { id } = await context.params;
    const body = (await request.json()) as UpdatePayload;
    if (!body.propertyId) return NextResponse.json({ error: "propertyId é obrigatório." }, { status: 400 });

    const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.status) {
      const normalized = body.status.toLowerCase();
      if (!allowedStatuses.has(normalized)) return NextResponse.json({ error: "Status inválido." }, { status: 400 });
      changes.status = normalized;
    }
    if (body.price !== undefined) {
      const price = body.price === null ? null : Number(body.price);
      if (price !== null && (!Number.isFinite(price) || price < 0)) return NextResponse.json({ error: "Preço inválido." }, { status: 400 });
      changes.price = price;
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("properties")
      .update(changes)
      .eq("id", body.propertyId)
      .eq("development_id", id)
      .eq("organization_id", identity.organizationId)
      .select("id,title,unit_number,floor,typology,price,area,bedrooms,bathrooms,parking_spaces,status,updated_at")
      .single();

    if (error || !data) return NextResponse.json({ error: error?.message || "Unidade não encontrada." }, { status: 404 });

    await admin.from("atlas_events").insert({
      organization_id: identity.organizationId,
      event_type: "inventory.updated",
      source: "launch-os.inventory",
      aggregate_type: "property",
      aggregate_id: body.propertyId,
      payload: changes,
      correlation_id: crypto.randomUUID(),
    });

    logger.info("launch_os.inventory_updated", { organizationId: identity.organizationId, developmentId: id, propertyId: body.propertyId, changes });
    return NextResponse.json({ property: data });
  } catch (error) {
    logger.warn("launch_os.inventory_update_failed", { error: error instanceof Error ? error.message : String(error) });
    return authFailure(error);
  }
}
