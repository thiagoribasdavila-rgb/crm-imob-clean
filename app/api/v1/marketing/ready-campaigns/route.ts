/**
 * GET /api/v1/marketing/ready-campaigns — as campanhas PRONTAS para aprovação
 * (Arvo e Spin), regeneradas pelo pipeline governado no servidor (mesma saída
 * determinística dos scripts build-*-proposal.mjs). Cada uma volta com o plano
 * de publicação (steps, todos PAUSED) pronto para virar proposta em
 * /api/v1/marketing/proposals (kind: "create"), sem tocar a Meta.
 *
 * Só liderança comercial vê (propor campanha é decisão da liderança). Nada aqui
 * cria nada; page_id/lead_form/mídia continuam sendo exigidos apenas na ATIVAÇÃO.
 *
 * ── A régua, e por que ela faltava justo aqui ──────────────────────────────
 *
 * Esta é a porta que produz as propostas REAIS: o painel da Sala de Comando lê
 * `campaigns[].steps` daqui e manda para `/api/v1/marketing/proposals` sem
 * remontar nada. E até 02/08/2026 ela era a única composição sem conferência de
 * política: `grep -n "validateCopy|regua|conferirPeca|validateHousingTargeting|
 * validatePublication"` neste arquivo não devolvia NADA. A rota irmã
 * (campanhas-criativos-proposta) tinha ganhado a régua; esta ficou aberta.
 *
 * Agora o plano passa por `conferirPlanoNaMeta` — a MESMA régua, alimentada
 * pelo plano que vai ser enviado, não por um parente remontado. O veredito viaja
 * na resposta e `podePropor` diz se aquela campanha pode ir à Caixa.
 *
 * A rota continua PURA (sem rede): é contrato dela, e há portão que falha se ela
 * tocar a Graph. É por isso que a chave de geolocalização vem do catálogo
 * (`brief.cityKey`) e não de uma resolução em tempo de requisição.
 */

import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { productBrief } from "@/lib/atlas/developer-portfolio";
import { buildAdCopy, toAssetFeedSpec, leadCampaignSkeleton, type CreativeAngle } from "@/lib/ai/creative-strategist";
import { housingTargetingSpec } from "@/lib/meta/marketing/housing-audience";
import { conferirPlanoNaMeta } from "@/lib/marketing/regua-no-plano";
import type { VereditoDaRegua } from "@/lib/marketing/regua-da-meta";
import { planFullPublication } from "@/lib/meta/marketing/publication-plan";
import type { ExecutionStep } from "@/lib/meta/marketing/campaign-executor";

export const dynamic = "force-dynamic";

const LEADERSHIP = new Set(["director", "superintendent", "manager"]);
const PAGE = "<<PAGE_ID>>";
const LEAD_FORM = "<<LEAD_FORM_ID>>";

type ReadyCampaign = {
  id: string;
  product: string;
  title: string;
  persona: string;
  dailyBrl: number;
  adCount: number;
  angles: string[];
  accountId: string;
  steps: ExecutionStep[];
  pageId: string | null;
  leadFormId: string | null;
  missingToActivate: string[];
  /** Veredito da régua da Meta sobre ESTE plano, item a item, com fonte. */
  regua: VereditoDaRegua;
  /** `false` quando a régua acha bloqueio de PROPOR (política, texto, público). */
  podePropor: boolean;
  /** Por que não pode propor. Vazio quando pode. */
  motivos: string[];
};

/** Regenera o plano de publicação de uma campanha (mesma lógica dos geradores). */
function buildReady(
  id: string,
  productName: string,
  persona: string,
  angles: CreativeAngle[],
  dailyBrl: number,
  accountId: string,
  pageId: string | null,
  leadFormId: string | null,
): ReadyCampaign | null {
  const brief = productBrief(productName);
  if (!brief) return null;
  const copy = buildAdCopy(brief, angles);
  /**
   * Geo pela CHAVE do catálogo, nunca pelo nome.
   *
   * Isto mandava `cities: ["São Paulo"]` — o NOME onde a Meta espera a CHAVE.
   * Medido contra a conta real (leitura, 02/08/2026): com a chave "269969" o
   * `delivery_estimate` devolve 19,7–23,2 milhões de pessoas e
   * `targetingsentencelines` escreve "Brasil: São Paulo (+24 km)"; com "São
   * Paulo" no mesmo campo devolve 0–0 e a frase sai ": (+24 km)" — a localização
   * simplesmente some. A Meta não recusa: ACEITA e resolve para lugar nenhum.
   *
   * Sem chave no catálogo o público cai para o país inteiro — que é amplo, mas
   * é verdadeiro. Cair para o nome seria propor um anúncio que não alcança
   * ninguém e que parece certo em todas as telas.
   */
  const targeting = brief.cityKey
    ? housingTargetingSpec({ countries: ["BR"], cities: [brief.cityKey] })
    : housingTargetingSpec({ countries: ["BR"] });
  const skeleton = leadCampaignSkeleton(brief, dailyBrl * 7, targeting);
  const assetFeedSpec = toAssetFeedSpec(copy, { linkUrl: "http://fb.me/", pageId: pageId ?? PAGE });
  const steps = planFullPublication({
    accountId,
    pageId: pageId ?? PAGE,
    leadFormId: leadFormId ?? LEAD_FORM,
    product: brief.product,
    skeleton,
    assetFeedSpec,
    adAngles: copy.angles,
  });
  const missing: string[] = [];
  if (!pageId) missing.push("META_PAGE_ID (Página do Facebook/Instagram)");
  if (!leadFormId) missing.push("META_LEAD_FORM_ID (formulário instantâneo)");
  missing.push("upload da mídia (hashes de imagem / video_ids)");
  // A régua mede o PLANO recém-montado — o mesmo objeto que o painel envia à
  // Caixa de Aprovações. Medir a `copy` em vez do plano deixaria de fora
  // justamente o que o plano acrescenta: categoria especial e público.
  const regua = conferirPlanoNaMeta(steps);
  return {
    id,
    product: brief.product,
    title: `[Atlas] Leads — ${brief.product}${brief.city ? ` — ${brief.city}` : ""}`,
    persona,
    dailyBrl,
    adCount: steps.filter((s) => s.kind === "create_ad").length,
    angles: copy.angles,
    accountId,
    steps,
    pageId,
    leadFormId,
    missingToActivate: missing,
    regua,
    podePropor: regua.podePropor,
    motivos: regua.motivos,
  };
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 30, scope: "ready-campaigns" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;

  const { access, meta } = identity;
  const role = access.profile.commercialRole || (access.profile.role === "admin" ? "director" : access.profile.role);
  if (!LEADERSHIP.has(role)) {
    return apiError("FORBIDDEN", "Propor campanha é decisão da liderança comercial.", meta, { status: 403, headers: limited.headers });
  }

  const accountId = process.env.META_AD_ACCOUNT_ID?.trim();
  if (!accountId) {
    return apiError("META_NOT_CONFIGURED", "META_AD_ACCOUNT_ID ausente — configure a conta de anúncios antes de propor campanhas.", meta, { status: 503, headers: limited.headers });
  }
  const pageId = process.env.META_PAGE_ID?.trim() || null;
  const leadFormId = process.env.META_LEAD_FORM_ID?.trim() || null;

  const campaigns = [
    buildReady("arvo", "Arvo", "investidor", ["investimento", "localizacao", "estilo_de_vida"], 100, accountId, pageId, leadFormId),
    buildReady("spin", "Spin Mood", "morador / primeiro imóvel", ["sair_do_aluguel", "entrega_imediata", "localizacao", "estilo_de_vida"], 60, accountId, pageId, leadFormId),
  ].filter((c): c is ReadyCampaign => c !== null);

  return apiSuccess({ campaigns, readyToActivate: Boolean(pageId && leadFormId) }, meta, { headers: limited.headers });
}
