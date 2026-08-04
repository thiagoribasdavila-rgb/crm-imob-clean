import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { coletarFontesDeRegiao } from "@/lib/marketing/coleta-de-regiao";

/**
 * COLETA DO ESTUDO DE REGIÃO — a porta que faltava na Fase 69.
 *
 * A rota irmã (`../route.ts`) tem GET, POST e PATCH: ler, cadastrar UMA fonte à
 * mão e revisar. Ela existe desde a Fase 69 e `project_region_sources` tem zero
 * linha — digitar título, publicador, URL, resumo e duas datas por fonte é
 * trabalho que ninguém fez nunca.
 *
 * Esta rota coleta com procedência e ENTREGA NA MESMA PORTA: chama a mesma RPC
 * `upsert_project_region_source`, com o mesmo ator, e o resultado nasce
 * `pending` para a mesma revisão humana do PATCH. Ela não cria um segundo
 * caminho de verdade; ela enche o primeiro.
 *
 * `{"ensaioSeco": true}` pesquisa de verdade e não grava nada — é como se
 * confere procedência antes de deixar a coleta encostar no banco.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Mesmo recorte de papel do POST da rota irmã — quem cadastra fonte é gestão. */
const PODE_COLETAR = new Set(["admin", "director", "superintendent", "manager"]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Teto baixo e janela longa: cada coleta é uma chamada paga ao provedor de
  // pesquisa. O limite protege a conta do dono, não o servidor.
  const rate = enforceRateLimit(request, { limit: 6, windowMs: 3_600_000, scope: "region.study.collect" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const papel = access.access.profile.commercialRole || access.access.profile.role;
  if (!PODE_COLETAR.has(String(papel))) {
    return apiError("FORBIDDEN", "Coletar fonte regional é da liderança comercial.", access.meta, { status: 403, headers: rate.headers });
  }

  const { id } = await params;
  if (!UUID.test(id)) return apiError("DEVELOPMENT_INVALID", "Empreendimento inválido.", access.meta, { status: 400, headers: rate.headers });

  const body = (await request.json().catch(() => null)) as { ensaioSeco?: unknown } | null;
  const ensaioSeco = body?.ensaioSeco === true;

  try {
    const resultado = await coletarFontesDeRegiao({
      organizationId: access.access.organization.id,
      developmentId: id,
      actorId: access.access.profile.id,
      ensaioSeco,
      signal: request.signal,
    });
    structuredApiLog("info", "region_source.collected", request, access.meta, {
      developmentId: id,
      status: resultado.status,
      aceitas: resultado.aceitas.length,
      descartadas: resultado.descartadas.length,
      gravadas: resultado.gravadas.filter((item) => item.erro === null).length,
      ensaioSeco,
    });
    return apiSuccess(
      {
        ...resultado,
        // Dito na resposta, e não só no comentário: quem chama precisa saber que
        // não recebeu fonte pronta para uso.
        politica: {
          reviewStatusDaMaquina: resultado.reviewStatus,
          verificacaoEhHumana: true,
          afirmacaoSemFonteNaoEntra: true,
          validadeCalculadaPelaCategoria: true,
          escritaNaMetaExecutada: false,
        },
      },
      access.meta,
      { status: resultado.status === "gravado" ? 201 : 200, headers: rate.headers },
    );
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "falha desconhecida";
    structuredApiLog("warn", "region_source.collect_failed", request, access.meta, { developmentId: id, motivo: motivo.slice(0, 160) });
    return apiError("REGION_COLLECT_FAILED", `Não foi possível coletar as fontes agora. Nada foi gravado. Causa: ${motivo.slice(0, 160)}`, access.meta, { status: 502, headers: rate.headers });
  }
}
