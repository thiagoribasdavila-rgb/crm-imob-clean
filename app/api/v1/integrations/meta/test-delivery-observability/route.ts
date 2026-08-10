import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  observeMetaTestDelivery,
  type MetaTestDeliveryObservation,
} from "@/lib/meta/test-delivery-observability";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ConversionRow = {
  attempts: number | null;
  custom_data: Record<string, unknown> | null;
  delivered_at: string | null;
  event_id: string;
  event_name: string;
  last_error: string | null;
  meta_response: Record<string, unknown> | null;
  occurred_at: string;
  status: string;
};

type ReceiptRow = { payload: { eventId?: unknown } | null };

function jsonError(code: string, message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 30,
    scope: "meta-test-delivery-observability",
    windowMs: 60 * 60_000,
  });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request, {
    accessRoles: ["admin", "director_decisor", "director"],
  });
  if (!access.ok) return access.response;

  const organizationId = access.access.organization.id;
  const admin = getSupabaseAdmin();
  const [conversions, receipts] = await Promise.all([
    admin
      .from("meta_conversion_events")
      .select("event_id,event_name,status,attempts,occurred_at,delivered_at,meta_response,custom_data,last_error")
      .eq("organization_id", organizationId)
      .like("event_id", "atlas-test-%")
      .order("occurred_at", { ascending: false })
      .limit(20),
    admin
      .from("atlas_events")
      .select("payload")
      .eq("organization_id", organizationId)
      .eq("event_type", "meta.test_lead.delivery_result")
      .order("occurred_at", { ascending: false })
      .limit(20),
  ]);
  if (conversions.error || receipts.error) {
    return jsonError(
      "META_TEST_OBSERVABILITY_UNAVAILABLE",
      "Não foi possível reconciliar o teste Meta agora.",
      503,
      rate.headers,
    );
  }

  const receiptEventIds = new Set(
    ((receipts.data ?? []) as ReceiptRow[])
      .map((row) => row.payload?.eventId)
      .filter((eventId): eventId is string => typeof eventId === "string"),
  );
  const observations: MetaTestDeliveryObservation[] = (
    (conversions.data ?? []) as ConversionRow[]
  ).map((conversion) => observeMetaTestDelivery({
    attempts: conversion.attempts,
    customData: conversion.custom_data,
    deliveredAt: conversion.delivered_at,
    eventId: conversion.event_id,
    eventName: conversion.event_name,
    hasFailure: Boolean(conversion.last_error),
    hasReceipt: receiptEventIds.has(conversion.event_id),
    metaResponse: conversion.meta_response,
    occurredAt: conversion.occurred_at,
    status: conversion.status,
  }));

  return NextResponse.json(
    {
      data: {
        generatedAt: new Date().toISOString(),
        observations,
        policy: {
          automaticResend: false,
          inconclusiveAttemptsRequireManualReconciliation: true,
          productionEnabled: false,
        },
      },
    },
    { headers: rate.headers },
  );
}
