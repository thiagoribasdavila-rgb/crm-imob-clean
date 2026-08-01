import type { NextRequest } from "next/server";
import { apiError, apiSuccess, structuredApiLog } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  montarRelatorioSemanal,
  semanaAnteriorA,
  semanaFechadaAte,
  type NumerosDoEmpreendimento,
  type Semana,
} from "@/lib/developers/weekly-report";

export const dynamic = "force-dynamic";

/**
 * RELATÓRIO SEMANAL DE UM INCORPORADOR PARCEIRO.
 *
 * A conta mora em `lib/developers/weekly-report` e é pura. Esta rota só a
 * alimenta com o que o banco sabe. O que o banco não sabe entra como `null` e o
 * relatório declara a lacuna — nunca a preenche com zero, porque este documento
 * vai para fora e a incorporadora decide verba com ele.
 *
 * A rota NÃO envia nada. Devolve o relatório e o book pronto; mandar é ação
 * humana, na tela, ou o worker de domingo — e mesmo o worker prepara o envio,
 * não dispara sozinho para o parceiro.
 */

/** Mediana em minutos, ou null quando não há amostra. */
function medianaEmMinutos(intervalos: number[]): number | null {
  if (!intervalos.length) return null;
  const ordenados = [...intervalos].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  const valor = ordenados.length % 2
    ? ordenados[meio]
    : (ordenados[meio - 1] + ordenados[meio]) / 2;
  return Math.round(valor / 60_000);
}

type LeadDaSemana = {
  id: string;
  development_id: string | null;
  created_at: string;
  first_contacted_at: string | null;
  first_contact_due_at: string | null;
  status: string | null;
};

async function apurar(
  organizationId: string,
  developerId: string,
  semana: Semana,
): Promise<{ nome: string; empreendimentos: NumerosDoEmpreendimento[] } | null> {
  const admin = getSupabaseAdmin();

  const { data: incorporador } = await admin
    .from("developers")
    .select("id,trade_name,legal_name")
    .eq("id", developerId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!incorporador) return null;

  const { data: empreendimentos } = await admin
    .from("developments")
    .select("id,name")
    .eq("organization_id", organizationId)
    .eq("developer_id", developerId);

  const ids = (empreendimentos ?? []).map((e) => e.id);
  if (!ids.length) {
    return { nome: incorporador.trade_name || incorporador.legal_name, empreendimentos: [] };
  }

  // Visita e proposta já carregam `development_id` — não é preciso passar pela
  // lead. Isso importa além da economia de consulta: uma visita agendada nesta
  // semana para uma lead que entrou no mês passado CONTA para o empreendimento,
  // e amarrá-la à lead da semana a deixaria de fora.
  const [leads, campanhas, visitas, propostas, gastos] = await Promise.all([
    admin.from("leads")
      .select("id,development_id,created_at,first_contacted_at,first_contact_due_at,status")
      .eq("organization_id", organizationId)
      .in("development_id", ids)
      .gte("created_at", semana.inicio)
      .lte("created_at", semana.fim),
    admin.from("marketing_campaigns")
      .select("id,name,project_id")
      .eq("organization_id", organizationId),
    admin.from("lead_visits")
      .select("id,development_id")
      .eq("organization_id", organizationId)
      .in("development_id", ids)
      .gte("scheduled_at", semana.inicio)
      .lte("scheduled_at", semana.fim),
    admin.from("commercial_simulations")
      .select("id,development_id")
      .eq("organization_id", organizationId)
      .in("development_id", ids)
      .gte("created_at", semana.inicio)
      .lte("created_at", semana.fim),
    // marketing_spend só tem linha quando a conta de anúncios responde. Zero
    // linhas quer dizer "não sei", e não "gastou zero" — a diferença é a que
    // separa relatório honesto de relatório inventado.
    //
    // O gasto é por CAMPANHA (`campaign_id`), não por empreendimento: chega até
    // aqui pela campanha e é a campanha que aponta o projeto.
    admin.from("marketing_spend")
      .select("amount,campaign_id")
      .eq("organization_id", organizationId)
      .gte("spend_date", semana.inicio.slice(0, 10))
      .lte("spend_date", semana.fim.slice(0, 10)),
  ]);

  const todasAsLeads = (leads.data ?? []) as LeadDaSemana[];

  const contarPor = (linhas: Array<{ development_id: string | null }> | null) => {
    const mapa = new Map<string, number>();
    for (const linha of linhas ?? []) {
      if (!linha.development_id) continue;
      mapa.set(linha.development_id, (mapa.get(linha.development_id) ?? 0) + 1);
    }
    return mapa;
  };
  const visitasPorEmpreendimento = contarPor(visitas.data);
  const propostasPorEmpreendimento = contarPor(propostas.data);

  const projetoDaCampanha = new Map(
    (campanhas.data ?? []).map((c) => [c.id, c.project_id as string | null]),
  );
  const gastoPorEmpreendimento = new Map<string, number>();
  for (const g of gastos.data ?? []) {
    const projeto = g.campaign_id ? projetoDaCampanha.get(g.campaign_id) : null;
    if (!projeto) continue;
    gastoPorEmpreendimento.set(
      projeto,
      (gastoPorEmpreendimento.get(projeto) ?? 0) + Number(g.amount ?? 0),
    );
  }

  const vendido = (status: string | null) =>
    ["ganho", "vendido", "won", "fechado"].includes(String(status ?? "").toLowerCase());

  const linhas: NumerosDoEmpreendimento[] = (empreendimentos ?? []).map((e) => {
    const minhas = todasAsLeads.filter((l) => l.development_id === e.id);
    const contatadas = minhas.filter((l) => l.first_contacted_at);
    const intervalos = contatadas.map(
      (l) => new Date(l.first_contacted_at as string).getTime() - new Date(l.created_at).getTime(),
    );

    return {
      developmentId: e.id,
      nome: e.name,
      leadsRecebidas: minhas.length,
      leadsContatadas: contatadas.length,
      medianaDeRespostaMin: medianaEmMinutos(intervalos.filter((ms) => ms >= 0)),
      leadsComSlaVencido: minhas.filter(
        (l) => !l.first_contacted_at && l.first_contact_due_at
          && new Date(l.first_contact_due_at) < new Date(),
      ).length,
      visitasAgendadas: visitasPorEmpreendimento.get(e.id) ?? 0,
      propostas: propostasPorEmpreendimento.get(e.id) ?? 0,
      vendas: minhas.filter((l) => vendido(l.status)).length,
      campanhas: (campanhas.data ?? [])
        .filter((c) => c.project_id === e.id)
        .map((c) => c.name)
        .filter(Boolean),
      gasto: gastoPorEmpreendimento.has(e.id) ? gastoPorEmpreendimento.get(e.id) ?? 0 : null,
    };
  });

  return { nome: incorporador.trade_name || incorporador.legal_name, empreendimentos: linhas };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rate = enforceRateLimit(request, { limit: 30, scope: "developers.weekly-report" });
  if (!rate.ok) return rate.response;
  const access = await requireAccessContext(request);
  if (!access.ok) return access.response;

  const papel = access.access.profile.commercialRole || access.access.profile.role;
  if (!["director", "superintendent", "manager", "admin"].includes(papel)) {
    return apiError(
      "FORBIDDEN",
      "Relatório de parceiro é da liderança comercial — ele sai da casa em nome da empresa.",
      access.meta,
      { status: 403, headers: rate.headers },
    );
  }

  const { id } = await params;
  const organizationId = access.access.organization.id;

  // `?ate=` permite reemitir uma semana passada sem esperar o próximo domingo.
  const ate = new URL(request.url).searchParams.get("ate");
  const referencia = ate ? new Date(ate) : new Date();
  if (Number.isNaN(referencia.getTime())) {
    return apiError("DATA_INVALIDA", "Data de referência inválida.", access.meta, { status: 400, headers: rate.headers });
  }

  const semana = semanaFechadaAte(referencia);
  const anterior = semanaAnteriorA(semana);

  const [atual, passada] = await Promise.all([
    apurar(organizationId, id, semana),
    apurar(organizationId, id, anterior),
  ]);

  if (!atual) {
    return apiError("INCORPORADOR_NAO_ENCONTRADO", "Incorporador não encontrado nesta organização.", access.meta, { status: 404, headers: rate.headers });
  }

  const relatorio = montarRelatorioSemanal({
    incorporador: { id, nome: atual.nome },
    semana,
    empreendimentos: atual.empreendimentos,
    semanaAnterior: passada
      ? {
          leadsRecebidas: passada.empreendimentos.reduce((t, e) => t + e.leadsRecebidas, 0),
          leadsContatadas: passada.empreendimentos.reduce((t, e) => t + e.leadsContatadas, 0),
        }
      : null,
  });

  structuredApiLog("info", "developers.weekly_report_gerado", request, access.meta, {
    organizationId, developerId: id, semana: semana.rotulo,
    leads: relatorio.total.leadsRecebidas, vazio: relatorio.vazio,
  });

  return apiSuccess(relatorio, access.meta, { headers: rate.headers });
}
