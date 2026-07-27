/**
 * REGISTRAR O CONSENTIMENTO DE UMA LEAD.
 *
 * É o único campo que falta para a conversão voltar para a Meta. Medido no
 * banco vivo: 217 leads, todas com identificador, sete já em etapa que dispara
 * evento — e zero prontas, porque nenhuma tem consentimento registrado.
 *
 * ── Quem pode registrar ─────────────────────────────────────────────────────
 *
 * Quem atende a lead: o corretor dono dela, ou a liderança. Um corretor não
 * registra consentimento de lead alheia — ele não esteve naquela conversa, e o
 * registro afirma que o cliente autorizou.
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

const LIDERANCA = new Set(["director", "superintendent", "manager"]);

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

  // O dono da lead ou a liderança. Registrar consentimento de lead alheia
  // seria afirmar, em nome de outra pessoa, que o cliente autorizou.
  const ehDono = lead.assigned_to === perfilId || lead.assigned_user_id === perfilId;
  if (!ehDono && !LIDERANCA.has(String(papel))) {
    return apiError("FORBIDDEN",
      "Só quem atende a lead — ou a liderança — registra o consentimento dela.",
      identity.meta, { status: 403 });
  }

  // Origem: o corretor declara o que ouviu do cliente. `formulario_meta` não é
  // aceito aqui de propósito — essa base vem do webhook da Meta, quando a lead
  // preencheu o formulário dentro da plataforma. Deixar alguém marcá-la à mão
  // transformaria uma base legal verificável numa afirmação sem lastro.
  const origem: OrigemDoConsentimento = corpo?.origem === "importado"
    ? "importado" : "declarado_pelo_corretor";

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
