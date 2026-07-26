import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { avaliarStopLoss, resumoDoStopLoss } from "@/lib/marketing/stop-loss";

export const dynamic = "force-dynamic";

/**
 * STOP LOSS DE MARKETING — leitura do estado e veredito.
 *
 * O motor (lib/marketing/stop-loss) é puro; esta rota só o alimenta com o que o
 * banco e o ambiente sabem hoje. O que não dá para saber entra como `null`, e o
 * veredito o reporta em `naoAvaliado` — nunca como zero.
 *
 * A rota NÃO executa nada: não pausa campanha, não corta verba, não chama a
 * Meta. Devolve decisão para virar proposta na Caixa de Aprovações. É a mesma
 * fronteira de todo o resto: a máquina executa o reversível e propõe o
 * irreversível, e mexer em verba é irreversível dentro do dia.
 *
 * O teto do período vem por parâmetro ou por ATLAS_MARKETING_BUDGET_CEILING.
 * Sem teto acordado, as regras de verba não rodam — cobrar meta que ninguém
 * combinou é inventar régua.
 */

const DIAS_DO_PERIODO = 30;

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, windowMs: 60_000, scope: "marketing.stop-loss" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const papel = access.access.profile.commercialRole || access.access.profile.role;
  if (!["director", "superintendent", "manager", "admin"].includes(papel)) {
    return apiError("FORBIDDEN", "Stop loss de verba é da liderança comercial.", access.meta, { status: 403, headers: rate.headers });
  }

  const url = new URL(request.url);
  const tetoInformado = Number(url.searchParams.get("teto"));
  const cplInformado = Number(url.searchParams.get("cplAlvo"));
  const teto = Number.isFinite(tetoInformado) && tetoInformado > 0
    ? tetoInformado
    : Number(process.env.ATLAS_MARKETING_BUDGET_CEILING) || 0;
  const cplAlvo = Number.isFinite(cplInformado) && cplInformado > 0
    ? cplInformado
    : Number(process.env.ATLAS_MARKETING_TARGET_CPL) || null;

  const organizationId = access.access.organization.id;
  const admin = getSupabaseAdmin();
  const inicio = new Date(Date.now() - DIAS_DO_PERIODO * 86_400_000).toISOString();
  const agora = new Date().toISOString();

  const [gasto, recebidas, contatadas, slaVencido, semDono, corretores, fontes] = await Promise.all([
    // marketing_spend só tem linha quando a conta de anúncios responde. Zero
    // linhas significa "não sei", e não "gastou zero" — a diferença decide se o
    // stop loss avalia custo ou se declara cegueira.
    admin.from("marketing_spend").select("amount").eq("organization_id", organizationId).gte("date", inicio.slice(0, 10)),
    admin.from("leads").select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId).not("campaign_id", "is", null).gte("created_at", inicio),
    admin.from("leads").select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId).not("campaign_id", "is", null).gte("created_at", inicio)
      .not("first_contacted_at", "is", null),
    admin.from("leads").select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId).not("campaign_id", "is", null)
      .is("first_contacted_at", null).lt("first_contact_due_at", agora),
    admin.from("leads").select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId).not("campaign_id", "is", null).is("assigned_user_id", null),
    admin.from("profiles").select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId).eq("active", true).eq("commercial_role", "broker"),
    admin.from("meta_lead_sources").select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId).eq("active", false),
  ]);

  const linhasDeGasto = (gasto.data ?? []) as Array<{ amount: number | null }>;
  const gastoConhecido = !gasto.error && linhasDeGasto.length > 0;
  const somaGasta = gastoConhecido
    ? linhasDeGasto.reduce((soma, l) => soma + Number(l.amount ?? 0), 0)
    : null;

  // Represa exige chamada à Meta e é ação sob demanda; aqui entra zero e a
  // ressalva vai no texto, para o número não parecer medido quando não foi.
  const veredito = avaliarStopLoss(
    {
      teto,
      gasto: somaGasta,
      // Fração do período decorrida é sempre 1 numa janela móvel de 30 dias
      // fechada em hoje — o que anula a regra de ritmo. Mantida explícita para
      // quando o período passar a ser calendário (mês fechado).
      fracaoDecorrida: 1,
      cplAlvo,
    },
    {
      leadsRecebidas: recebidas.count ?? 0,
      leadsContatadas: contatadas.count ?? 0,
      leadsComSlaVencido: slaVencido.count ?? 0,
      leadsSemDono: semDono.count ?? 0,
      leadsRepresadas: 0,
      corretoresAtivos: corretores.count ?? 0,
    },
  );

  const ressalvas = [
    !teto ? "Nenhum teto de verba acordado: defina ATLAS_MARKETING_BUDGET_CEILING ou informe ?teto= para ligar as regras de orçamento." : null,
    (fontes.count ?? 0) > 0
      ? `${fontes.count} fonte(s) de lead inativas — a represa não entra nesta conta. Apure em Marketing → Leads represadas.`
      : null,
  ].filter(Boolean);

  structuredApiLog("info", "marketing.stop_loss_avaliado", request, access.meta, {
    organizationId, acao: veredito.acao, decisoes: veredito.decisoes.length, gastoConhecido,
  });

  return apiSuccess({
    periodoDias: DIAS_DO_PERIODO,
    orcamento: { teto: teto || null, gasto: somaGasta, cplAlvo },
    ...veredito,
    resumo: resumoDoStopLoss(veredito),
    ressalvas,
    // Explícito no payload para não restar dúvida de leitura.
    governanca: {
      executaSozinho: false,
      exigeAprovacaoHumana: true,
      onde: "/approvals",
    },
  }, access.meta, { headers: rate.headers });
}
