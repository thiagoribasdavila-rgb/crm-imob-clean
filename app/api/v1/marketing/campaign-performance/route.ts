import type { NextRequest } from "next/server";
import { apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * DESEMPENHO DE CAMPANHA PELO AVANÇO NO CRM.
 *
 * O princípio que define este endpoint: CPL barato com lead que não avança é
 * prejuízo disfarçado de eficiência. Aqui a campanha é julgada pelo que
 * aconteceu DEPOIS do clique — contato, qualificação, visita, proposta, venda.
 *
 * Funciona sem a Meta. Gasto, impressão e clique dependem da API de anúncios e
 * aparecem como `null` enquanto ela não estiver conectada — nunca como zero,
 * que seria confundido com "não gastou".
 */

const AVANCADOS = ["contato", "qualificacao", "visita", "proposta", "contrato", "ganho"];

type LinhaLead = {
  id: string; status: string | null; assigned_user_id: string | null;
  first_contacted_at: string | null; created_at: string | null;
};
type LinhaToque = {
  lead_id: string; campaign_external_id: string | null; adset_external_id: string | null;
  ad_external_id: string | null; form_external_id: string | null; channel: string | null;
  development_id: string | null;
};

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "campaign.performance" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const organizationId = access.access.organization.id;
  const admin = getSupabaseAdmin();

  const [toques, leads, empreendimentos] = await Promise.all([
    admin.from("lead_attribution_touches")
      .select("lead_id,campaign_external_id,adset_external_id,ad_external_id,form_external_id,channel,development_id")
      .eq("organization_id", organizationId).not("campaign_external_id", "is", null).limit(5000),
    admin.from("leads").select("id,status,assigned_user_id,first_contacted_at,created_at")
      .eq("organization_id", organizationId).limit(5000),
    admin.from("developments").select("id,name").eq("organization_id", organizationId),
  ]);

  const porLead = new Map<string, LinhaLead>(((leads.data ?? []) as LinhaLead[]).map((l) => [l.id, l]));
  const nomeEmpreendimento = new Map(((empreendimentos.data ?? []) as Array<{ id: string; name: string }>).map((d) => [d.id, d.name]));

  // Agrupa por (campanha, conjunto, anúncio, formulário, canal): é o recorte em
  // que a decisão de pausar ou escalar é tomada.
  type Agregado = {
    campanha: string; conjunto: string | null; anuncio: string | null; formulario: string | null;
    canal: string | null; empreendimento: string | null;
    leads: number; comDono: number; contatados: number; avancaram: number; ganhos: number; perdidos: number;
  };
  const grupos = new Map<string, Agregado>();

  for (const t of ((toques.data ?? []) as LinhaToque[])) {
    const lead = porLead.get(t.lead_id);
    if (!lead) continue;
    const chave = [t.campaign_external_id, t.adset_external_id, t.ad_external_id, t.form_external_id, t.channel].join("|");
    const atual = grupos.get(chave) ?? {
      campanha: t.campaign_external_id ?? "—", conjunto: t.adset_external_id, anuncio: t.ad_external_id,
      formulario: t.form_external_id, canal: t.channel,
      empreendimento: t.development_id ? nomeEmpreendimento.get(t.development_id) ?? null : null,
      leads: 0, comDono: 0, contatados: 0, avancaram: 0, ganhos: 0, perdidos: 0,
    };
    const status = String(lead.status ?? "").toLowerCase();
    atual.leads += 1;
    if (lead.assigned_user_id) atual.comDono += 1;
    if (lead.first_contacted_at) atual.contatados += 1;
    if (AVANCADOS.includes(status)) atual.avancaram += 1;
    if (status === "ganho") atual.ganhos += 1;
    if (status === "perdido") atual.perdidos += 1;
    grupos.set(chave, atual);
  }

  const linhas = [...grupos.values()]
    .map((g) => ({
      ...g,
      // Percentuais só quando há base: taxa sobre 1 lead não é taxa, é ruído.
      taxaContato: g.leads >= 5 ? Number((g.contatados / g.leads).toFixed(3)) : null,
      taxaAvanco: g.leads >= 5 ? Number((g.avancaram / g.leads).toFixed(3)) : null,
      // Só a Meta sabe estes. Null é honesto; zero seria mentira.
      gasto: null, impressoes: null, cliques: null, cpl: null,
    }))
    .sort((a, b) => b.leads - a.leads);

  // ── ALERTAS OPERACIONAIS que não dependem da Meta ──────────────────────
  const alertas: Array<{ nivel: "critico" | "atencao"; titulo: string; detalhe: string; acao: string }> = [];

  const totalAtribuido = linhas.reduce((s, l) => s + l.leads, 0);
  const totalContatado = linhas.reduce((s, l) => s + l.contatados, 0);
  if (totalAtribuido >= 10 && totalContatado === 0) {
    alertas.push({
      nivel: "critico",
      titulo: "Nenhuma lead de campanha foi contatada",
      detalhe: `${totalAtribuido} leads vieram de campanha e nenhuma tem primeiro contato registrado.`,
      acao: "Verificar se a equipe está registrando o contato no CRM — sem isso não há como medir a qualidade da campanha.",
    });
  }

  const semDono = linhas.reduce((s, l) => s + (l.leads - l.comDono), 0);
  if (semDono > 0) {
    alertas.push({
      nivel: "atencao",
      titulo: `${semDono} lead(s) de campanha sem responsável`,
      detalhe: "Lead sem dono não é atendida por ninguém.",
      acao: "Distribuir na tela de distribuição.",
    });
  }

  const semAvanco = linhas.filter((l) => l.leads >= 10 && l.avancaram === 0);
  for (const l of semAvanco) {
    alertas.push({
      nivel: "atencao",
      titulo: `Formulário ${l.formulario ?? "—"} sem nenhum avanço`,
      detalhe: `${l.leads} leads entraram e nenhuma saiu de "novo".`,
      acao: "Conferir se a promessa do anúncio bate com o produto, ou se o atendimento não começou.",
    });
  }

  return apiSuccess({
    linhas,
    resumo: {
      campanhas: new Set(linhas.map((l) => l.campanha)).size,
      leadsAtribuidas: totalAtribuido,
      contatadas: totalContatado,
      avancaram: linhas.reduce((s, l) => s + l.avancaram, 0),
      ganhos: linhas.reduce((s, l) => s + l.ganhos, 0),
    },
    alertas,
    // A interface precisa saber por que metade das colunas está vazia.
    metricasDeMidia: {
      disponivel: false,
      motivo: "As métricas de gasto, impressão, clique e CPL vêm da API de anúncios da Meta, que ainda não está conectada.",
      proximaAcao: "Configurar um token de system user do mesmo Business Manager do app e rodar `npm run integrations:health`.",
    },
  }, access.meta, { headers: rate.headers });
}
