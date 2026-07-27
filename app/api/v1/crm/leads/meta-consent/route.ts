/**
 * REGISTRAR O CONSENTIMENTO DE UMA LEAD.
 *
 * É o único campo que falta para a conversão voltar para a Meta. Medido no
 * banco vivo: 217 leads, todas com identificador, sete já em etapa que dispara
 * evento — e zero prontas, porque nenhuma tem consentimento registrado.
 *
 * ── Quem pode registrar ─────────────────────────────────────────────────────
 *
 * Só o DIRETOR. Ele responde pela base legal de todas as leads e de todos os
 * formulários com consentimento — e responsabilidade não se delega para quem
 * não tem como assumi-la.
 *
 * Corretor e gerente enxergam o estado; registrar é outra coisa.
 *
 * ── O que fica gravado ──────────────────────────────────────────────────────
 *
 * Estado, origem, autor e data. Um booleano solto não defende ninguém numa
 * fiscalização: "o sistema diz que sim" não é resposta. Quem registrou e
 * quando, é.
 */

import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  aplicarConsentimento, ehEstadoValido, lerEstado, faltaParaEnviar,
  type OrigemDoConsentimento,
} from "@/lib/crm/meta-consent";

export const dynamic = "force-dynamic";

/**
 * Só o DIRETOR registra consentimento.
 *
 * Decisão do dono do produto (2026-07-27): ele responde por todas as leads e
 * por todos os formulários com consentimento.
 *
 * Faz sentido: o consentimento não é observação sobre a lead, é declaração de
 * BASE LEGAL para tratar dado pessoal de terceiro. Quem responde por ela numa
 * fiscalização é a empresa, não quem atendeu a ligação — e não se transfere
 * essa responsabilidade para quem não tem como assumi-la.
 *
 * Corretor e gerente continuam VENDO o estado; registrar é outra coisa.
 */
const QUEM_REGISTRA = new Set(["director"]);

export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 120, scope: "meta-consent-write" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;

  const corpo = (await request.json().catch(() => null)) as {
    leadId?: string; estado?: string; origem?: string;
  } | null;

  const leadId = typeof corpo?.leadId === "string" && /^[0-9a-f-]{36}$/i.test(corpo.leadId)
    ? corpo.leadId : null;
  if (!leadId) return apiError("LEAD_INVALID", "Informe a lead.", identity.meta, { status: 400 });
  if (!ehEstadoValido(corpo?.estado)) {
    return apiError("ESTADO_INVALID",
      'Estado inválido — use "concedido", "negado" ou "nao_perguntado".',
      identity.meta, { status: 422 });
  }

  const admin = getSupabaseAdmin();
  const organizationId = identity.access.organization.id;
  const perfilId = identity.access.profile.id;
  const papel = identity.access.profile.commercialRole
    || (identity.access.profile.role === "admin" ? "director" : identity.access.profile.role);

  const { data: lead, error } = await admin
    .from("leads")
    .select("id,email,phone,phone_normalized,status,metadata,assigned_to,assigned_user_id")
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !lead) {
    return apiError("LEAD_NOT_FOUND", "Lead não encontrada nesta organização.", identity.meta, { status: 404 });
  }

  // Nem o dono da lead escapa: registrar base legal é ato do diretor.
  const ehAdmin = identity.access.profile.role === "admin";
  if (!ehAdmin && !QUEM_REGISTRA.has(String(papel))) {
    return apiError("FORBIDDEN",
      "Registrar o consentimento é do diretor — é ele quem responde pela base legal de todas as leads e formulários.",
      identity.meta, { status: 403 });
  }

  // `formulario_meta` não é aceito aqui de propósito: essa base vem do webhook,
  // quando a lead preencheu o formulário DENTRO da Meta. Deixar marcá-la à mão
  // transformaria base verificável em afirmação sem lastro.
  //
  // O registro manual é sempre declaração da diretoria — é ela quem assina.
  const origem: OrigemDoConsentimento = corpo?.origem === "importado"
    ? "importado" : "declarado_pelo_diretor";

  const metadata = aplicarConsentimento(lead.metadata, {
    estado: corpo.estado,
    origem,
    registradoPor: perfilId,
  });

  const { error: erroGravacao } = await admin
    .from("leads")
    .update({ metadata })
    .eq("id", leadId)
    .eq("organization_id", organizationId);

  if (erroGravacao) {
    return apiError("SAVE_FAILED", "Não foi possível gravar o consentimento.", identity.meta, { status: 503 });
  }

  const atualizada = { ...lead, metadata };
  return apiSuccess({
    estado: lerEstado(metadata),
    origem,
    registradoEm: new Date().toISOString(),
    // O que AINDA falta, para a tela não precisar recalcular a regra.
    faltaParaEnviar: faltaParaEnviar(atualizada),
  }, identity.meta, { headers: limited.headers });
}
