import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { cacheHeaders } from "@/lib/api/cache-headers";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import {
  LIVE_LEAD_SELECT,
  LIVE_LEAD_SELECT_WITH_SLA,
  isMissingRelation,
  isMissingColumn,
  mapLegacyLead,
  type CompatRow,
} from "@/lib/compat/legacy-v2";
import {
  LIVE_PROFILE_SELECT,
  descendantsFromLiveProfiles,
  resolveLiveHierarchy,
} from "@/lib/compat/live-hierarchy";

export const dynamic = "force-dynamic";

const TERMINAL = new Set(["ganho", "perdido", "arquivado", "comprou_outro"]);
const normalize = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const text = (value: unknown) => (typeof value === "string" ? value : "");
const time = (value: unknown) => {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, {
    limit: 60,
    scope: "manager-team-sla",
  });
  if (!limited.ok) return limited.response;

  const identity = await requireAccessContext(request, { roles: ["manager"] });
  if (!identity.ok) return identity.response;

  const organizationId = identity.access.organization.id;
  const managerId = identity.access.profile.id;
  const [profileResult, leadResultInicial] = await Promise.all([
    identity.supabase
      .from("profiles")
      .select(LIVE_PROFILE_SELECT)
      .eq("organization_id", organizationId)
      .eq("active", true)
      .limit(1000),
    // Select estendido com as colunas de SLA da fase 34; se o banco não as
    // tiver, o bloco abaixo repete sem elas. Sem isso a medição seria calculada
    // sobre campos que a query nunca trouxe — que é como este endpoint passou
    // a vida devolvendo zero.
    identity.supabase
      .from("leads")
      .select(LIVE_LEAD_SELECT_WITH_SLA)
      .eq("organization_id", organizationId)
      .limit(10000),
  ]);

  let slaMensuravel = true;
  let leadResult = leadResultInicial;
  if (leadResult.error && isMissingColumn(leadResult.error)) {
    slaMensuravel = false;
    leadResult = await identity.supabase
      .from("leads")
      .select(LIVE_LEAD_SELECT)
      .eq("organization_id", organizationId)
      .limit(10000);
  }

  if (profileResult.error || leadResult.error) {
    return apiError(
      "TEAM_SLA_LOAD_FAILED",
      "Não foi possível consolidar a fila de atendimento do time.",
      identity.meta,
      { status: 503 },
    );
  }

  // Ciclos de follow-up da fase 35. Tabela ausente (banco legado) não derruba o
  // endpoint: a medição vem indisponível e é reportada como tal.
  const ciclos = await identity.supabase
    .from("follow_up_sla_events")
    .select("lead_id,broker_id,status,response_minutes,delay_minutes,on_time,scheduled_at")
    .eq("organization_id", organizationId)
    .limit(10000);
  const followUpMensuravel = !ciclos.error || !isMissingRelation(ciclos.error);
  const ciclosLinhas = (ciclos.data ?? []) as Array<{
    lead_id: string; broker_id: string | null; status: string;
    response_minutes: number | null; delay_minutes: number | null; on_time: boolean | null;
  }>;

  const profiles = resolveLiveHierarchy(
    (profileResult.data ?? []) as unknown as CompatRow[],
  );
  const visibleIds = descendantsFromLiveProfiles(profiles, managerId);
  const brokers = profiles.filter(
    (profile) =>
      profile.commercial_role === "broker" &&
      visibleIds.has(text(profile.id)),
  );
  const brokerIds = new Set(brokers.map((broker) => text(broker.id)));
  const leads = ((leadResult.data ?? []) as unknown as CompatRow[])
    .map(mapLegacyLead)
    .filter((lead) => brokerIds.has(text(lead.assigned_to)));
  const brokerMap = new Map(
    brokers.map((broker) => [text(broker.id), text(broker.full_name) || "Corretor"]),
  );
  const now = Date.now();

  const alerts = leads
    .flatMap((lead) => {
      if (TERMINAL.has(normalize(lead.status))) return [];
      const owner = text(lead.assigned_to);
      const createdAt = time(lead.created_at);
      const nextAt = time(lead.next_action_at);
      const rows: Array<{
        kind: "first_contact" | "follow_up";
        dueAt: string;
        overdueMinutes: number;
      }> = [];
      // O prazo vem de first_contact_due_at, carimbado pelo gatilho conforme a
      // origem (5 min para mídia social paga, 15 min para as demais). O valor
      // cravado de 15 min que existia aqui ignorava a política e tratava lead
      // de Lead Ads como lead de portal.
      const prazoReal = lead.first_contact_due_at ? Date.parse(String(lead.first_contact_due_at)) : null;
      const prazoDeContato = prazoReal ?? (createdAt !== null ? createdAt + 15 * 60_000 : null);
      if (
        !lead.first_contacted_at &&
        normalize(lead.status) === "novo" &&
        prazoDeContato !== null &&
        prazoDeContato < now
      ) {
        const dueAt = prazoDeContato;
        rows.push({
          kind: "first_contact",
          dueAt: new Date(dueAt).toISOString(),
          overdueMinutes: Math.max(1, Math.floor((now - dueAt) / 60_000)),
        });
      }
      if (nextAt !== null && nextAt < now) {
        rows.push({
          kind: "follow_up",
          dueAt: new Date(nextAt).toISOString(),
          overdueMinutes: Math.max(1, Math.floor((now - nextAt) / 60_000)),
        });
      }
      return rows.map((row) => ({
        ...row,
        leadId: text(lead.id),
        leadName: text(lead.name) || "Lead",
        brokerId: owner,
        brokerName: brokerMap.get(owner) || "Corretor",
      }));
    })
    .sort((left, right) => right.overdueMinutes - left.overdueMinutes)
    .slice(0, 100);

  // ── MEDIÇÃO DO FOLLOW-UP ────────────────────────────────────────────────
  // Estes quatro indicadores viviam cravados em 0/null nesta rota. Zero cravado
  // é pior que ausência: o painel lia "nenhum follow-up fora do prazo" quando a
  // verdade era "nada foi medido". Agora saem de follow_up_sla_events.
  const medirFollowUp = (linhas: typeof ciclosLinhas) => {
    const concluidos = linhas.filter(
      (c) => (c.status === "completed" || c.status === "recovered") && c.response_minutes != null,
    );
    const noPrazo = concluidos.filter((c) => c.on_time === true);
    return {
      followUpsMeasured: concluidos.length,
      // Mesma regra do primeiro contato: taxa exige amostra.
      followUpComplianceRate:
        concluidos.length >= 5 ? Number((noPrazo.length / concluidos.length).toFixed(3)) : null,
      recoveredFollowUps: linhas.filter((c) => c.status === "recovered").length,
      averageFollowUpMinutes: concluidos.length
        ? Math.round(concluidos.reduce((soma, c) => soma + Number(c.response_minutes || 0), 0) / concluidos.length)
        : null,
    };
  };

  const leadsVisiveis = new Set(leads.map((lead) => text(lead.id)));
  const ciclosVisiveis = ciclosLinhas.filter((c) => leadsVisiveis.has(c.lead_id));
  const medicaoFollowUp = medirFollowUp(ciclosVisiveis);

  const byBroker = brokers
    .map((broker) => {
      const brokerId = text(broker.id);
      return {
        brokerId,
        brokerName: text(broker.full_name) || "Corretor",
        firstContactOverdue: alerts.filter(
          (alert) =>
            alert.brokerId === brokerId && alert.kind === "first_contact",
        ).length,
        followUpOverdue: alerts.filter(
          (alert) =>
            alert.brokerId === brokerId && alert.kind === "follow_up",
        ).length,
        // first_response_minutes e first_contact_sla_met medidos de verdade,
        // não derivados de idade do lead.
        measured: medicaoPrimeiroContato.measured,
        met: medicaoPrimeiroContato.met,
        complianceRate: medicaoPrimeiroContato.complianceRate,
        averageResponseMinutes: medicaoPrimeiroContato.averageResponseMinutes,
        ...medirFollowUp(ciclosVisiveis.filter((c) => c.broker_id === brokerId)),
      };
    })
    .sort(
      (left, right) =>
        right.firstContactOverdue - left.firstContactOverdue ||
        right.followUpOverdue - left.followUpOverdue,
    );

  // Medição de primeiro contato a partir das colunas reais. Só entra lead cujo
  // contato foi efetivamente registrado; nada é inferido de idade nem de status.
  const contatosMedidos = leads.filter(
    (lead) => lead.first_contacted_at && lead.first_response_minutes != null,
  );
  const dentroDoPrazo = contatosMedidos.filter((lead) => lead.first_contact_sla_met === true);
  const medicaoPrimeiroContato = {
    measured: contatosMedidos.length,
    met: dentroDoPrazo.length,
    // Taxa exige amostra: 1 contato não define cumprimento de SLA da equipe.
    complianceRate:
      contatosMedidos.length >= 5
        ? Number((dentroDoPrazo.length / contatosMedidos.length).toFixed(3))
        : null,
    averageResponseMinutes: contatosMedidos.length
      ? Math.round(
          contatosMedidos.reduce((soma, lead) => soma + Number(lead.first_response_minutes || 0), 0) /
            contatosMedidos.length,
        )
      : null,
  };

  return apiSuccess(
    {
      scope: {
        role: "manager",
        directBrokersOnly: true,
        organizationId,
      },
      totals: {
        alerts: alerts.length,
        firstContactOverdue: alerts.filter(
          (alert) => alert.kind === "first_contact",
        ).length,
        followUpOverdue: alerts.filter((alert) => alert.kind === "follow_up")
          .length,
        brokersWithAlerts: byBroker.filter(
          (broker) =>
            broker.firstContactOverdue + broker.followUpOverdue > 0,
        ).length,
        // first_response_minutes e first_contact_sla_met medidos de verdade,
        // não derivados de idade do lead.
        measured: medicaoPrimeiroContato.measured,
        met: medicaoPrimeiroContato.met,
        complianceRate: medicaoPrimeiroContato.complianceRate,
        averageResponseMinutes: medicaoPrimeiroContato.averageResponseMinutes,
        ...medicaoFollowUp,
        // "0 medidos" com a tabela ausente é diferente de "0 medidos" com a
        // tabela vazia. A tela precisa saber qual dos dois está lendo.
        followUpMensuravel,
      },
      alerts,
      byBroker,
      measurement: medicaoPrimeiroContato.measured > 0
        ? {
            status: "measured",
            reason: `${medicaoPrimeiroContato.measured} contato(s) medidos por first_response_minutes e first_contact_sla_met.`,
          }
        : slaMensuravel
          ? {
              status: "no-contacts-yet",
              reason:
                "O banco sabe medir, mas nenhum primeiro contato foi registrado ainda. Registre pelo endpoint de primeiro contato para a medição começar.",
            }
          : {
              status: "sla-columns-unavailable",
              reason:
                "Este banco não tem as colunas de SLA da fase 34. Os atrasos abaixo são derivados de idade do lead, não medidos.",
            },
      compatibility: "live-schema-safe",
      generatedAt: new Date().toISOString(),
    },
    identity.meta,
    { headers: { ...limited.headers, ...cacheHeaders({ maxAge: 60, swr: 120 }) } },
  );
}
