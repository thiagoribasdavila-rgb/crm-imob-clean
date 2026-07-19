import { NextResponse } from "next/server";
import { requireApiIdentity } from "@/lib/security/api-auth";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { GraphEntity, GraphRelationship } from "@/lib/atlas2030/contracts";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

type GraphPayload = {
  entities?: GraphEntity[];
  relationships?: GraphRelationship[];
};

export async function POST(request: Request) {
  const rate = checkRateLimit(clientKey(request, "atlas2030-graph"), { limit: 60, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Limite de atualização do grafo excedido." }, { status: 429 });
  }

  try {
    const identity = await requireApiIdentity(request);
    const body = (await request.json()) as GraphPayload;
    const entities = body.entities ?? [];
    const relationships = body.relationships ?? [];
    if (entities.length === 0 && relationships.length === 0) {
      return NextResponse.json({ error: "Informe entities ou relationships." }, { status: 400 });
    }
    if (entities.length > 500 || relationships.length > 1000) {
      return NextResponse.json({ error: "Lote acima do limite permitido." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    let entityCount = 0;
    let relationshipCount = 0;

    for (const entity of entities) {
      if (!entity.entityType || !entity.source) continue;
      const record = {
        organization_id: identity.organizationId,
        entity_type: entity.entityType,
        external_key: entity.externalKey ?? null,
        canonical_name: entity.canonicalName ?? null,
        attributes: entity.attributes ?? {},
        confidence: Math.max(0, Math.min(100, Number(entity.confidence ?? 100))),
        source: entity.source,
        updated_at: new Date().toISOString(),
      };
      const query = entity.externalKey
        ? admin.from("atlas_entities").upsert(record, { onConflict: "organization_id,entity_type,external_key" })
        : admin.from("atlas_entities").insert(record);
      const { error } = await query;
      if (error) throw error;
      entityCount += 1;
    }

    for (const relationship of relationships) {
      const endpointIds = [...new Set([relationship.fromEntityId, relationship.toEntityId])];
      const { data: scopedEntities, error: entityScopeError } = await admin
        .from("atlas_entities")
        .select("id")
        .eq("organization_id", identity.organizationId)
        .in("id", endpointIds);

      if (entityScopeError) throw entityScopeError;
      if ((scopedEntities?.length ?? 0) !== endpointIds.length) {
        return NextResponse.json(
          { error: "Relacionamento contém entidade inexistente ou fora da sua empresa." },
          { status: 403 },
        );
      }

      const { error } = await admin.from("atlas_relationships").insert({
        organization_id: identity.organizationId,
        from_entity_id: relationship.fromEntityId,
        relationship_type: relationship.relationshipType,
        to_entity_id: relationship.toEntityId,
        attributes: relationship.attributes ?? {},
        weight: relationship.weight ?? 1,
        confidence: relationship.confidence ?? 100,
      });
      if (error) throw error;
      relationshipCount += 1;
    }

    logger.info("atlas2030.graph_updated", { organizationId: identity.organizationId, entities: entityCount, relationships: relationshipCount });
    return NextResponse.json({ entities: entityCount, relationships: relationshipCount }, { status: 202 });
  } catch (error) {
    logger.error("atlas2030.graph_update_failed", error);
    const message = error instanceof Error ? error.message : "Falha ao atualizar o grafo.";
    const status = /token|sessão|autoriz/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
