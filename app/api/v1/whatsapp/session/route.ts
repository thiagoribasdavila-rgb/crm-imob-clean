/**
 * A SESSÃO DE WHATSAPP DO PRÓPRIO CORRETOR.
 *
 * GET  → estado atual (e o QR, quando está pareando)
 * POST → { action: "conectar" | "desconectar" }
 *
 * ── Quem manda nesta sessão ─────────────────────────────────────────────────
 *
 * Só o dono do número. A liderança enxerga quem está conectado (política de RLS
 * de leitura), mas não conecta nem desconecta ninguém: é o WhatsApp pessoal do
 * corretor, e derrubar a sessão de alguém pela interface seria mexer no celular
 * dos outros.
 *
 * ── O QR nunca é gravado ────────────────────────────────────────────────────
 *
 * O QR é a chave de pareamento: quem tiver ele entra na conta. Vive só no
 * processo da ponte, é buscado a cada consulta, e expira em segundos. No banco
 * fica apenas o estado.
 */

import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  enderecoDaPonte, segredoDaPonte, ponteConfigurada, mascararTelefone,
  type EstadoSessao,
} from "@/lib/whatsapp/bridge-contract";

export const dynamic = "force-dynamic";

async function chamarPonte(caminho: string, corpo: Record<string, unknown>): Promise<EstadoSessao | null> {
  const segredo = segredoDaPonte();
  if (!segredo) return null;
  try {
    const r = await fetch(`${enderecoDaPonte()}${caminho}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-atlas-bridge-secret": segredo },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    return (await r.json()) as EstadoSessao;
  } catch {
    // Ponte fora do ar não é erro do corretor — o GET abaixo devolve o último
    // estado conhecido do banco em vez de uma tela quebrada.
    return null;
  }
}

/** O que vai para a interface. Número sempre mascarado. */
function paraInterface(linha: Record<string, unknown> | null, aoVivo: EstadoSessao | null) {
  const status = aoVivo?.status ?? (linha?.status as string) ?? "desconectado";
  const telefone = aoVivo?.phoneE164 ?? (linha?.phone_e164 as string | null) ?? null;
  return {
    status,
    // Só existe enquanto está pareando, e vem da ponte — nunca do banco.
    qr: aoVivo?.status === "aguardando_qr" ? aoVivo.qr ?? null : null,
    telefone: mascararTelefone(telefone),
    conectadoDesde: aoVivo?.conectadoEm ?? (linha?.connected_at as string | null) ?? null,
    ultimaAtividade: aoVivo?.ultimaAtividadeEm ?? (linha?.last_activity_at as string | null) ?? null,
    erro: aoVivo?.erro ?? (linha?.last_error as string | null) ?? null,
    ponteAtiva: aoVivo !== null,
  };
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 60, scope: "whatsapp-session-read" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;

  const profileId = identity.access.profile.id;
  const { data: linha } = await getSupabaseAdmin()
    .from("whatsapp_broker_sessions")
    .select("status,phone_e164,connected_at,last_activity_at,last_error")
    .eq("profile_id", profileId)
    .maybeSingle();

  const aoVivo = ponteConfigurada() ? await chamarPonte("/estado", { profileId }) : null;

  return apiSuccess({
    ...paraInterface(linha, aoVivo),
    ponteConfigurada: ponteConfigurada(),
    // Dito na interface, não escondido em documentação: o corretor tem que
    // saber o que está aceitando antes de ler o QR.
    aviso: "A conexão por QR usa uma biblioteca não oficial e contraria os termos do WhatsApp. Existe risco de bloqueio do número. O aplicativo continua funcionando normalmente no celular.",
  }, identity.meta, { headers: limited.headers });
}

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 10, windowMs: 10 * 60_000, scope: "whatsapp-session-write" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;

  if (!ponteConfigurada()) {
    return apiError("BRIDGE_NOT_CONFIGURED",
      "A ponte de WhatsApp não está configurada neste servidor (ATLAS_WHATSAPP_BRIDGE_SECRET).",
      identity.meta, { status: 503 });
  }

  const corpo = (await request.json().catch(() => null)) as { action?: string } | null;
  const acao = corpo?.action;
  if (acao !== "conectar" && acao !== "desconectar") {
    return apiError("ACTION_INVALID", 'Ação inválida — use "conectar" ou "desconectar".', identity.meta, { status: 400 });
  }

  const profileId = identity.access.profile.id;
  const organizationId = identity.access.organization.id;

  const estado = await chamarPonte(acao === "conectar" ? "/conectar" : "/desconectar", { profileId, organizationId });
  if (!estado) {
    return apiError("BRIDGE_UNREACHABLE",
      "A ponte de WhatsApp não respondeu. Verifique se o processo atlas-whatsapp-bridge está no ar.",
      identity.meta, { status: 503 });
  }

  // O banco é espelho do que a ponte disse. A ponte também empurra por
  // /bridge/status quando o estado muda sozinho (queda, leitura do QR).
  await getSupabaseAdmin().from("whatsapp_broker_sessions").upsert({
    organization_id: organizationId,
    profile_id: profileId,
    status: estado.status,
    phone_e164: estado.phoneE164 ?? null,
    last_error: estado.erro ?? null,
    connected_at: estado.status === "conectado" ? (estado.conectadoEm ?? new Date().toISOString()) : null,
    disconnected_at: estado.status === "desconectado" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "profile_id" });

  return apiSuccess(paraInterface(null, estado), identity.meta, { headers: limited.headers });
}
