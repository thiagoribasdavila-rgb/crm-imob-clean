import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { auditarPecaDoEmpreendimento } from "@/lib/marketing/lastro-do-criativo";

/**
 * O PORTÃO DE LASTRO — "este texto pode ser publicado para este produto?".
 *
 * Existe como rota, e não só como função, porque quem escreve criativo neste
 * produto são vários caminhos (estúdio de criativos, proposta de campanha,
 * intake) e todos precisam da MESMA resposta. Uma rota é o lugar onde a regra
 * não pode ser reimplementada diferente em cada um deles.
 *
 * Não gera, não grava, não publica: só mede. Nenhum byte sai para a Meta.
 *
 * Corpo: {"textos": ["...", "..."]}
 * Resposta: quais textos ficam de pé, quais caem, e o motivo de cada queda.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TEXTOS = 40;
const MAX_CARACTERES = 2_000;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rate = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "region.study.lastro" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const { id } = await params;
  if (!UUID.test(id)) return apiError("DEVELOPMENT_INVALID", "Empreendimento inválido.", access.meta, { status: 400, headers: rate.headers });

  const body = (await request.json().catch(() => null)) as { textos?: unknown } | null;
  const textos = Array.isArray(body?.textos)
    ? body.textos.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, MAX_TEXTOS)
    : [];
  if (!textos.length) return apiError("TEXTOS_OBRIGATORIOS", "Informe ao menos um texto para auditar.", access.meta, { status: 400, headers: rate.headers });
  if (textos.some((texto) => texto.length > MAX_CARACTERES)) {
    return apiError("TEXTO_LONGO_DEMAIS", `Cada texto deve ter no máximo ${MAX_CARACTERES} caracteres.`, access.meta, { status: 400, headers: rate.headers });
  }

  try {
    const veredicto = await auditarPecaDoEmpreendimento({
      organizationId: access.access.organization.id,
      developmentId: id,
      textos,
    });
    structuredApiLog("info", "criativo.lastro_auditado", request, access.meta, {
      developmentId: id,
      textos: textos.length,
      reprovados: veredicto.removidos.length,
      fontesUtilizaveis: veredicto.auditoria.fontesUtilizaveis,
      leituraIncompleta: veredicto.leituraIncompleta,
    });
    return apiSuccess(veredicto, access.meta, { headers: rate.headers });
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "falha desconhecida";
    structuredApiLog("warn", "criativo.lastro_falhou", request, access.meta, { developmentId: id, motivo: motivo.slice(0, 160) });
    // Falha aqui NÃO é aprovação: quem chamou fica sem veredicto e deve tratar
    // isso como "não pode publicar", não como "não achou problema".
    return apiError("LASTRO_INDISPONIVEL", `Não foi possível conferir o lastro dos textos. Trate como NÃO liberado. Causa: ${motivo.slice(0, 160)}`, access.meta, { status: 502, headers: rate.headers });
  }
}
