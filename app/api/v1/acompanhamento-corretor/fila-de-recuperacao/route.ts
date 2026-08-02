import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { DISCARD_REASONS, getDiscardReason } from "@/lib/atlas/discard-reasons";
import { canonicalPipelineStage, DEFAULT_PIPELINE_STAGES } from "@/lib/atlas/pipeline-stages";
import { EVENTOS_DE_TENTATIVA } from "@/lib/crm/contact-attempts";
import { filtroDaCarteiraDaPessoa, leSoAPropriaCarteira } from "@/lib/crm/escopo-de-leitura";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * AS QUE SAÍRAM DIZENDO "NÃO ATENDEU" — E QUE NINGUÉM CHAMOU.
 *
 * ── O FATO ──────────────────────────────────────────────────────────────────
 *
 * Medido no banco vivo em 2026-08-02, sobre a última saída de cada lead em
 * `pipeline_stage_moves`:
 *
 *   saídas com motivo "Sem resposta após tentativas" ............. 252
 *   dessas, sem NENHUM sinal de contato registrado no CRM ........ 250
 *   tentativas registradas na base inteira (call+whatsapp) ........ 44
 *
 * O motivo AFIRMA tentativa. O CRM não tem tentativa. As duas coisas não podem
 * ser verdade ao mesmo tempo, e a diferença decide trabalho: lead que não
 * atendeu depois de cinco ligações é lead ruim; lead que ninguém chamou é fila.
 *
 * `lib/crm/contact-attempts.ts` já dizia isso em texto — "lead que ninguém
 * alcançou não é lead ruim" — e o piso de tentativas está DESLIGADO por decisão
 * do dono do produto para destravar a largada. Esta rota não religa trava
 * nenhuma: ela devolve a lista para que a decisão de rechamar seja tomada por
 * gente, com o número na frente.
 *
 * ── O RECORTE É EXPLÍCITO E DIZ OS DOIS LADOS ───────────────────────────────
 *
 * A rota devolve `total` (todas as saídas por aquele motivo) junto de
 * `semSinalDeContato` (as que entram na fila) e `comSinalDeContato` (as que
 * ficam de fora). Lista que encolhe sem dizer de quanto é a classe de defeito
 * que já esvaziou uma tela deste produto sem erro nenhum.
 *
 * ── QUEM É "RECUPERÁVEL" SAI DO CATÁLOGO, NÃO DE UMA CHAVE DIGITADA AQUI ────
 *
 * `metaCategory === "unreachable"` é a única categoria da taxonomia cujo texto
 * afirma tentativa de contato. Derivar do catálogo em vez de escrever
 * "inalcancavel" evita a segunda cópia do vocabulário — a origem de metade dos
 * defeitos deste repositório.
 */

const MOTIVOS_QUE_AFIRMAM_TENTATIVA = DISCARD_REASONS.filter(
  (motivo) => motivo.metaCategory === "unreachable",
).map((motivo) => motivo.key);

const ETAPAS_DE_SAIDA = ["perdido", "comprou_outro"];
const ROTULO_DA_ETAPA = new Map(DEFAULT_PIPELINE_STAGES.map((etapa) => [etapa.key, etapa.label]));
const LIMITE_DA_LISTA = 60;

function rotuloDaEtapa(valor: string | null): string {
  const canonica = canonicalPipelineStage(valor);
  if (canonica) return ROTULO_DA_ETAPA.get(canonica) ?? canonica;
  return String(valor || "").trim() || "etapa não registrada";
}

type LeadFechada = {
  id: string;
  name: string | null;
  phone: string | null;
  source: string | null;
  score: number | null;
  status: string | null;
  first_contacted_at: string | null;
};

type SaidaDoLedger = {
  id: string;
  lead_id: string | null;
  from_stage: string | null;
  discard_reason_key: string | null;
  discard_notes: string | null;
  reversal_of: string | null;
  occurred_at: string | null;
};

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "acompanhamento.fila-de-recuperacao" });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request, {
    roles: ["admin", "director", "superintendent", "manager", "broker"],
  });
  if (!identity.ok) return identity.response;

  const admin = getSupabaseAdmin();
  const organizationId = identity.access.organization.id;
  const perfil = { commercialRole: identity.access.profile.commercialRole, role: identity.access.profile.role };
  const soAMinhaCarteira = leSoAPropriaCarteira(perfil);

  // Lead sem dono NÃO entra na carteira de ninguém aqui, de propósito: esta é
  // uma fila de rechamada pessoal, e lead órfã na fila de todo mundo é trabalho
  // que parece atribuído sem ter dono. Para a liderança ela aparece, porque
  // liderança lê o funil inteiro.
  let consultaDeLeads = admin
    .from("leads")
    .select("id,name,phone,source,score,status,first_contacted_at")
    .eq("organization_id", organizationId)
    .in("status", ETAPAS_DE_SAIDA)
    .limit(2000);
  if (soAMinhaCarteira) {
    consultaDeLeads = consultaDeLeads.or(filtroDaCarteiraDaPessoa(identity.access.profile.id));
  }

  const [leadsResult, saidasResult, tentativasResult, primeiroDoLedger] = await Promise.all([
    consultaDeLeads,
    admin
      .from("pipeline_stage_moves")
      .select("id,lead_id,from_stage,discard_reason_key,discard_notes,reversal_of,occurred_at")
      .eq("organization_id", organizationId)
      .in("to_stage", ETAPAS_DE_SAIDA)
      // `occurred_at`, NÃO `created_at`: esta tabela não tem `created_at`, e um
      // filtro por coluna inexistente faz o PostgREST errar e a rota degradar.
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .limit(5000),
    admin
      .from("lead_events")
      .select("lead_id,event_type")
      .eq("organization_id", organizationId)
      .in("event_type", [...EVENTOS_DE_TENTATIVA])
      .limit(5000),
    admin
      .from("pipeline_stage_moves")
      .select("occurred_at")
      .eq("organization_id", organizationId)
      .order("occurred_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (leadsResult.error || saidasResult.error) {
    // Nunca 200 com zero: "nenhuma lead para rechamar" e "não consegui olhar"
    // são frases diferentes, e a primeira confirma uma tranquilidade falsa.
    return apiError(
      "FILA_DE_RECUPERACAO_INDISPONIVEL",
      "Não foi possível ler as saídas do funil agora.",
      identity.meta,
      { status: 503, headers: rate.headers },
    );
  }

  const leads = new Map(
    ((leadsResult.data ?? []) as LeadFechada[]).map((lead) => [String(lead.id), lead]),
  );

  // Tentativa é evento; ausência de evento com `first_contacted_at` preenchido
  // ainda é sinal de contato. As duas portas contam — a fila só recebe lead sem
  // NENHUM sinal, que é o lado conservador do erro.
  const tentativasPorLead = new Map<string, number>();
  if (!tentativasResult.error) {
    for (const linha of tentativasResult.data ?? []) {
      const leadId = String(linha.lead_id || "");
      if (!leadId) continue;
      tentativasPorLead.set(leadId, (tentativasPorLead.get(leadId) ?? 0) + 1);
    }
  }

  const saidas = (saidasResult.data ?? []) as SaidaDoLedger[];
  const desfeitas = new Set(saidas.map((linha) => linha.reversal_of).filter((valor): valor is string => Boolean(valor)));

  // A ÚLTIMA saída de cada lead é a que vale. A consulta já vem em ordem
  // decrescente, então a primeira que aparece por lead é a mais recente.
  const ultimaSaida = new Map<string, SaidaDoLedger>();
  for (const linha of saidas) {
    const leadId = String(linha.lead_id || "");
    if (!leadId || !leads.has(leadId)) continue;
    if (desfeitas.has(String(linha.id))) continue;
    if (!ultimaSaida.has(leadId)) ultimaSaida.set(leadId, linha);
  }

  const porMotivo = new Map<string, { chave: string; rotulo: string; leads: number; semSinalDeContato: number }>();
  const candidatas: Array<{ lead: LeadFechada; saida: SaidaDoLedger }> = [];
  let semMotivoGravado = 0;
  let recuperaveisTotal = 0;
  let recuperaveisComContato = 0;

  for (const [leadId, saida] of ultimaSaida) {
    const lead = leads.get(leadId)!;
    const semSinal = (tentativasPorLead.get(leadId) ?? 0) === 0 && !lead.first_contacted_at;
    const chave = String(saida.discard_reason_key || "").trim().toLowerCase();
    const catalogo = getDiscardReason(chave);
    // "Não medido" é um balde com NOME. Deixá-lo em branco faria a soma dos
    // motivos parecer o total das saídas, escondendo o que o sistema não gravou.
    const rotulo = catalogo?.label
      ?? (chave ? chave : "Não medido — o motivo não foi gravado");
    const balde = chave || "motivo_ausente";
    if (!chave) semMotivoGravado += 1;
    const bucket = porMotivo.get(balde) ?? { chave: balde, rotulo, leads: 0, semSinalDeContato: 0 };
    bucket.leads += 1;
    if (semSinal) bucket.semSinalDeContato += 1;
    porMotivo.set(balde, bucket);

    if (MOTIVOS_QUE_AFIRMAM_TENTATIVA.includes(chave)) {
      recuperaveisTotal += 1;
      if (semSinal) candidatas.push({ lead, saida });
      else recuperaveisComContato += 1;
    }
  }

  candidatas.sort((a, b) => String(b.saida.occurred_at || "").localeCompare(String(a.saida.occurred_at || "")));

  const motivoRecuperavel = getDiscardReason(MOTIVOS_QUE_AFIRMAM_TENTATIVA[0]);

  return apiSuccess(
    {
      escopo: soAMinhaCarteira ? "carteira" : "organizacao",
      fechadas: leads.size,
      comSaidaNoLedger: ultimaSaida.size,
      // Lead fechada sem saída no ledger não é lead sem motivo: é lead que saiu
      // ANTES de o registro existir. Somá-la a "sem motivo" culparia o corretor
      // por um período em que ninguém podia gravar nada.
      semSaidaNoLedger: leads.size - ultimaSaida.size,
      semMotivoGravado,
      motivos: [...porMotivo.values()].sort((a, b) => b.leads - a.leads),
      recuperaveis: {
        chave: motivoRecuperavel?.key ?? MOTIVOS_QUE_AFIRMAM_TENTATIVA[0] ?? "",
        rotulo: motivoRecuperavel?.label ?? "Sem resposta após tentativas",
        total: recuperaveisTotal,
        semSinalDeContato: candidatas.length,
        comSinalDeContato: recuperaveisComContato,
        mostrando: Math.min(candidatas.length, LIMITE_DA_LISTA),
        itens: candidatas.slice(0, LIMITE_DA_LISTA).map(({ lead, saida }) => ({
          leadId: String(lead.id),
          nome: lead.name || "Lead sem nome",
          telefone: lead.phone || null,
          fonte: lead.source || null,
          score: Number.isFinite(Number(lead.score)) ? Number(lead.score) : null,
          saidaEm: saida.occurred_at,
          deEtapa: rotuloDaEtapa(saida.from_stage),
          notas: saida.discard_notes || null,
        })),
      },
      ledgerDesde: primeiroDoLedger.data?.occurred_at ?? null,
      // A contagem de tentativas depende de uma leitura que pode falhar sozinha.
      // Se falhar, a tela precisa saber — senão leria "sem tentativa" para todo
      // mundo e a fila incharia com lead que já foi trabalhada.
      tentativasMensuraveis: !tentativasResult.error,
      medidoEm: new Date().toISOString(),
    },
    identity.meta,
    { headers: { ...rate.headers, "Cache-Control": "no-store" } },
  );
}
