import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  carregarEmpreendimento, gerarBriefing, gerarCopies, salvarCriativos,
  type ObjetivoCampanha,
} from "@/lib/marketing/creative-studio";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJETIVOS = new Set<ObjetivoCampanha>([
  "gerar_leads", "contato_whatsapp", "gerar_visitas", "divulgar_lancamento",
  "vender_estoque", "atrair_investidores", "remarketing",
]);
const PODE_GERAR = new Set(["admin", "director", "superintendent", "manager"]);

/**
 * GET — insumo do briefing sem gastar um único token de IA.
 * Serve à etapa de revisão do wizard: mostra o que está cadastrado e o que
 * falta confirmar ANTES de qualquer geração.
 */
export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "creative-studio.read" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const developmentId = new URL(request.url).searchParams.get("developmentId") ?? "";
  if (!UUID.test(developmentId)) return apiError("DEVELOPMENT_INVALID", "Informe o empreendimento.", access.meta, { status: 400, headers: rate.headers });

  const base = await carregarEmpreendimento(access.access.organization.id, developmentId);
  if (!base) return apiError("DEVELOPMENT_NOT_FOUND", "Empreendimento não encontrado no seu escopo.", access.meta, { status: 404, headers: rate.headers });

  return apiSuccess({
    empreendimento: base,
    prontoParaGerar: base.pendencias.length === 0,
    // Pendência não impede gerar — impede PROMETER. A peça sai sem o dado.
    aviso: base.pendencias.length
      ? "A geração é permitida, mas as peças NÃO citarão preço, prazo ou condição enquanto esses dados não forem confirmados no cadastro."
      : null,
  }, access.meta, { headers: rate.headers });
}

/**
 * POST — gera briefing + copies com IA real e grava as peças como RASCUNHO.
 *
 * O que esta rota deliberadamente NÃO faz: publicar campanha, gastar verba,
 * ativar anúncio ou marcar peça como aprovada. Tudo nasce em `draft`.
 */
export async function POST(request: NextRequest) {
  // Limite baixo de propósito: cada chamada custa dinheiro em token.
  const rate = enforceRateLimit(request, { limit: 10, windowMs: 60_000, scope: "creative-studio.generate" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const papel = access.access.profile.commercialRole || access.access.profile.role;
  if (!PODE_GERAR.has(String(papel))) {
    return apiError("FORBIDDEN", "Geração de criativos é da liderança comercial ou do marketing.", access.meta, { status: 403, headers: rate.headers });
  }

  let body: { developmentId?: unknown; objetivo?: unknown; campanha?: unknown };
  try { body = await request.json(); }
  catch { return apiError("INVALID_JSON", "Dados inválidos.", access.meta, { status: 400, headers: rate.headers }); }

  const developmentId = typeof body.developmentId === "string" ? body.developmentId : "";
  const objetivo = String(body.objetivo ?? "") as ObjetivoCampanha;
  if (!UUID.test(developmentId)) return apiError("DEVELOPMENT_INVALID", "Informe o empreendimento.", access.meta, { status: 400, headers: rate.headers });
  if (!OBJETIVOS.has(objetivo)) return apiError("OBJECTIVE_INVALID", `Objetivo inválido. Use um de: ${[...OBJETIVOS].join(", ")}.`, access.meta, { status: 400, headers: rate.headers });

  const organizationId = access.access.organization.id;
  const base = await carregarEmpreendimento(organizationId, developmentId);
  if (!base) return apiError("DEVELOPMENT_NOT_FOUND", "Empreendimento não encontrado no seu escopo.", access.meta, { status: 404, headers: rate.headers });

  const admin = getSupabaseAdmin();
  const nomeCampanha = String(body.campanha ?? "").trim().slice(0, 120) || `${base.nome} · ${objetivo}`;

  try {
    // 1) Briefing: uma chamada, reaproveitada pelas copies.
    const b = await gerarBriefing(base, objetivo, organizationId, access.access.profile.id);
    // 2) Copies a partir do briefing — sem reenviar a ficha do empreendimento.
    const c = await gerarCopies(b.briefing, base.nome, objetivo, organizationId, access.access.profile.id);

    // A campanha nasce em rascunho. Publicação é outro fluxo, com aprovação.
    const campanha = await admin.from("marketing_campaigns").insert({
      organization_id: organizationId, name: nomeCampanha,
      platform: "meta", status: "draft",
    }).select("id,name,status").single();
    if (campanha.error) throw campanha.error;

    const salvos = await salvarCriativos(organizationId, campanha.data.id, c.copies, {
      briefing: b.briefing, modelo: c.modelo, provedor: c.provedor,
      custoUsd: (b.custoUsd ?? 0) + (c.custoUsd ?? 0),
      developmentId,
    }, access.access.profile.id);

    const custoTotal = (b.custoUsd ?? 0) + (c.custoUsd ?? 0);
    structuredApiLog("info", "creative_studio.generated", request, access.meta, {
      organizationId, developmentId, campaignId: campanha.data.id,
      provedor: b.provedor, modelo: b.modelo,
      tokens: b.tokens + c.tokens, custoUsd: custoTotal,
    });

    return apiSuccess({
      campanha: campanha.data,
      briefing: b.briefing,
      copies: c.copies,
      criativosSalvos: salvos.criados,
      // Custo exposto sempre: quem gera precisa ver o que gastou.
      consumo: {
        provedor: b.provedor, modelo: b.modelo,
        tokensTotais: b.tokens + c.tokens,
        custoEstimadoUsd: custoTotal || null,
        chamadas: 2,
      },
      pendenciasDoProduto: base.pendencias,
      proximoPasso: "Revisar as peças, escolher as imagens e enviar para aprovação. Nada foi publicado.",
    }, access.meta, { status: 201, headers: rate.headers });
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "falha desconhecida";
    structuredApiLog("warn", "creative_studio.failed", request, access.meta, { organizationId, developmentId, motivo: motivo.slice(0, 120) });
    return apiError("CREATIVE_GENERATION_FAILED", "Não foi possível gerar as peças agora. Nenhuma campanha foi criada.", access.meta, { status: 502, headers: rate.headers });
  }
}
