import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  medirFunilDosCriativos,
  type CriativoMedido,
  type LeadDoCriativo,
} from "@/lib/marketing/creative-funnel";

export const dynamic = "force-dynamic";

/**
 * FUNIL REAL DE CADA CRIATIVO — a metade que a Meta não sabe.
 *
 * Gasto, impressão e clique dependem de `ads_read`, que a conta de anúncios
 * ainda não concedeu. Lead, primeiro contato, visita, proposta e venda são
 * NOSSOS — estão no CRM, e não dependem de permissão de ninguém.
 *
 * Esta rota mede a segunda metade, que é a mais valiosa para decidir criativo:
 * CTR alto com lead que não fecha é peça ruim vestida de boa, e só o funil de
 * baixo revela isso.
 *
 * ── POR QUE RECALCULA EM VEZ DE GUARDAR ─────────────────────────────────────
 *
 * A tabela `creative_performance_daily_facts` existe e recebe fato diário por
 * digitação. Ela continua servindo ao que vem da plataforma (gasto, impressão).
 * O funil do CRM NÃO é gravado lá de propósito: as leads são a fonte da verdade
 * e recalcular sobre elas está sempre certo. Materializar criaria uma segunda
 * cópia que envelhece — e uma lead que avança de etapa amanhã deixaria o número
 * de ontem errado sem ninguém perceber.
 */

/** GET — mede o funil por criativo. Só leitura, nada muda. */
export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, scope: "marketing.creative-funnel" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const papel = access.access.profile.commercialRole || access.access.profile.role;
  if (!["director", "superintendent", "manager", "admin"].includes(papel)) {
    return apiError("FORBIDDEN", "Desempenho de criativo é da liderança comercial.", access.meta, { status: 403, headers: rate.headers });
  }

  const organizationId = access.access.organization.id;
  const admin = getSupabaseAdmin();

  const [versoes, leads, empreendimentos] = await Promise.all([
    admin.from("creative_intelligence_versions")
      .select("id,creative_asset_id,development_id,format,message_angle,review_status,external_ad_id,external_platform,hook")
      .eq("organization_id", organizationId)
      .limit(2000),
    admin.from("leads")
      .select("id,status,metadata,first_contacted_at,development_id")
      .eq("organization_id", organizationId)
      .limit(20000),
    admin.from("developments").select("id,name").eq("organization_id", organizationId).limit(1000),
  ]);

  if (versoes.error) {
    return apiError("CRIATIVOS_INDISPONIVEIS", "Aplique a migration da inteligência criativa.", access.meta, { status: 503, headers: rate.headers });
  }

  const nomeDoEmpreendimento = new Map(
    (empreendimentos.data ?? []).map((d) => [d.id as string, d.name as string]),
  );

  // Nomes vêm do ativo, não da versão. Uma consulta a mais é melhor que um join
  // aninhado que falha em silêncio quando a relação não existe no schema cache.
  const idsDeAtivo = (versoes.data ?? []).map((v) => v.creative_asset_id).filter(Boolean);
  const ativos = idsDeAtivo.length
    ? await admin.from("creative_assets").select("id,name").in("id", idsDeAtivo).eq("organization_id", organizationId)
    : { data: [] as Array<{ id: string; name: string }> };
  const nomeDoAtivo = new Map((ativos.data ?? []).map((a) => [a.id as string, a.name as string]));

  // ── O par de convenções ────────────────────────────────────────────────────
  //
  // O backfill grava `ad_id` (snake) e o processador do outbox grava `adId`
  // (camel). Ler só uma perderia metade das leads — e seria o mesmo defeito de
  // coluna legada que esta base já teve em cinco lugares, agora dentro do JSON.
  const anuncioDaLead = (metadata: unknown): string | null => {
    if (!metadata || typeof metadata !== "object") return null;
    const m = metadata as Record<string, unknown>;
    const valor = m.ad_id ?? m.adId;
    return typeof valor === "string" && valor.trim() ? valor.trim() : null;
  };

  const ganhou = (status: unknown) =>
    ["ganho", "vendido", "won", "fechado"].includes(String(status ?? "").toLowerCase());
  const passouDaQualificacao = (status: unknown) =>
    ["qualificacao", "visita", "proposta", "contrato", "ganho", "vendido"].includes(
      String(status ?? "").toLowerCase(),
    );

  const linhasDeLead = (leads.data ?? []) as Array<{
    id: string; status: string | null; metadata: unknown; first_contacted_at: string | null;
  }>;

  // Visitas e propostas por lead vêm das tabelas próprias — o status do lead diz
  // onde ele ESTÁ, não por onde passou. Uma lead que visitou e depois se perdeu
  // continua tendo visitado, e a peça que a trouxe merece o crédito.
  const idsComAnuncio = linhasDeLead.filter((l) => anuncioDaLead(l.metadata)).map((l) => l.id);
  const [visitas, propostas] = idsComAnuncio.length
    ? await Promise.all([
        admin.from("lead_visits").select("lead_id").eq("organization_id", organizationId).in("lead_id", idsComAnuncio),
        admin.from("commercial_simulations").select("lead_id").eq("organization_id", organizationId).in("lead_id", idsComAnuncio),
      ])
    : [{ data: [] as Array<{ lead_id: string }> }, { data: [] as Array<{ lead_id: string }> }];

  const visitou = new Set((visitas.data ?? []).map((v) => v.lead_id));
  const teveProposta = new Set((propostas.data ?? []).map((p) => p.lead_id));

  const leadsPorAnuncio = new Map<string, LeadDoCriativo[]>();
  let leadsSemCriativo = 0;
  for (const lead of linhasDeLead) {
    const anuncio = anuncioDaLead(lead.metadata);
    if (!anuncio) {
      leadsSemCriativo += 1;
      continue;
    }
    const lista = leadsPorAnuncio.get(anuncio) ?? [];
    lista.push({
      contatada: Boolean(lead.first_contacted_at),
      qualificada: passouDaQualificacao(lead.status),
      visitou: visitou.has(lead.id),
      recebeuProposta: teveProposta.has(lead.id),
      comprou: ganhou(lead.status),
    });
    leadsPorAnuncio.set(anuncio, lista);
  }

  const criativos: CriativoMedido[] = (versoes.data ?? []).map((v) => ({
    versionId: v.id as string,
    nome: nomeDoAtivo.get(v.creative_asset_id as string) || String(v.hook ?? "Criativo sem nome"),
    adId: (v.external_ad_id as string | null) ?? null,
    empreendimento: nomeDoEmpreendimento.get(v.development_id as string) ?? null,
    formato: String(v.format ?? "—"),
    angulo: String(v.message_angle ?? "—"),
    revisao: String(v.review_status ?? "pending"),
  }));

  // Anúncios que trazem lead e não estão vinculados a criativo nenhum. É a fila
  // de trabalho da agência: cada um destes é uma peça no ar que ninguém
  // registrou, e portanto uma medição que se perde.
  const anunciosVinculados = new Set(criativos.map((c) => c.adId).filter(Boolean));
  const anunciosOrfaos = [...leadsPorAnuncio.entries()]
    .filter(([anuncio]) => !anunciosVinculados.has(anuncio))
    .map(([anuncio, lista]) => ({ adId: anuncio, leads: lista.length }))
    .sort((a, b) => b.leads - a.leads);

  const veredito = medirFunilDosCriativos({ criativos, leadsPorAnuncio, leadsSemCriativo });

  structuredApiLog("info", "marketing.creative_funnel_medido", request, access.meta, {
    organizationId,
    criativos: criativos.length,
    comAmostra: veredito.total.comAmostra,
    anunciosOrfaos: anunciosOrfaos.length,
  });

  return apiSuccess({
    ...veredito,
    anunciosOrfaos,
    governanca: {
      // Dito no payload para quem lê a API sem abrir a tela.
      alegacaoCausalPermitida: false,
      executaSozinho: false,
      fonte: "leads do CRM — não depende de ads_read",
      porQueNaoGrava: "as leads são a fonte da verdade; materializar criaria cópia que envelhece",
    },
  }, access.meta, { headers: rate.headers });
}

/**
 * PATCH — vincula uma versão de criativo ao anúncio que está no ar.
 *
 * É o gesto que liga toda a estrutura: sem o id do anúncio, a peça existe no
 * Atlas e o desempenho dela é invisível. Com ele, o funil inteiro passa a ser
 * medido sozinho.
 */
export async function PATCH(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 20, scope: "marketing.creative-funnel.link" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const papel = access.access.profile.commercialRole || access.access.profile.role;
  if (!["director", "superintendent", "manager", "admin"].includes(papel)) {
    return apiError("FORBIDDEN", "Vincular anúncio a criativo é da liderança comercial.", access.meta, { status: 403, headers: rate.headers });
  }

  const corpo = (await request.json().catch(() => null)) as
    | { versionId?: string; adId?: string | null; plataforma?: string }
    | null;
  const versionId = String(corpo?.versionId ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(versionId)) {
    return apiError("VERSAO_INVALIDA", "Informe a versão do criativo.", access.meta, { status: 400, headers: rate.headers });
  }

  // `null` desvincula — caso legítimo quando o anúncio é substituído. Sem esta
  // saída, corrigir um vínculo errado exigiria mexer no banco à mão.
  const adId = corpo?.adId === null ? null : String(corpo?.adId ?? "").trim();
  if (adId !== null && !/^[0-9]{5,32}$/.test(adId)) {
    return apiError("ANUNCIO_INVALIDO", "O id do anúncio da Meta é numérico. Copie-o do Gerenciador de Anúncios.", access.meta, { status: 400, headers: rate.headers });
  }
  const plataforma = String(corpo?.plataforma ?? "meta").toLowerCase();
  if (!["meta", "google"].includes(plataforma)) {
    return apiError("PLATAFORMA_INVALIDA", "Plataforma deve ser meta ou google.", access.meta, { status: 400, headers: rate.headers });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("creative_intelligence_versions")
    .update({
      external_ad_id: adId,
      external_platform: adId === null ? null : plataforma,
    })
    .eq("id", versionId)
    .eq("organization_id", access.access.organization.id)
    .select("id,external_ad_id")
    .maybeSingle();

  if (error) {
    // O índice único protege contra dois criativos apontando para o mesmo
    // anúncio — que dividiria as leads entre eles e deixaria as duas leituras
    // erradas, cada uma para menos.
    const duplicado = error.code === "23505";
    return apiError(
      duplicado ? "ANUNCIO_JA_VINCULADO" : "FALHA_AO_VINCULAR",
      duplicado
        ? "Este anúncio já pertence a outro criativo. Um anúncio mede uma peça só — desvincule o outro antes."
        : "Não foi possível vincular o anúncio.",
      access.meta,
      { status: duplicado ? 409 : 500, headers: rate.headers },
    );
  }
  if (!data) {
    return apiError("VERSAO_NAO_ENCONTRADA", "Criativo não encontrado nesta organização.", access.meta, { status: 404, headers: rate.headers });
  }

  structuredApiLog("info", "marketing.criativo_vinculado_ao_anuncio", request, access.meta, {
    organizationId: access.access.organization.id, versionId, adId,
  });

  return apiSuccess({ versionId, adId: data.external_ad_id }, access.meta, { headers: rate.headers });
}
