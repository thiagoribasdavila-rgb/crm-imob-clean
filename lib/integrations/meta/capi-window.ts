/**
 * O NÚCLEO DO LOTE CAPI — uma régua só, dois chamadores.
 *
 * ── Por que isto saiu da rota ───────────────────────────────────────────────
 *
 * Este bloco morava dentro de `app/api/v1/integrations/meta/capi-export`, que
 * exige sessão humana de liderança e por isso NÃO roda por cron. Resultado
 * medido: `meta_conversion_events` com 0 linhas — nenhum evento de conversão
 * jamais saiu, porque virou um botão que ninguém aperta.
 *
 * Sem esse sinal de volta, a Meta otimiza para quem PREENCHE FORMULÁRIO, não
 * para quem compra. É a maior alavanca de eficiência de anúncio do produto.
 *
 * A saída é um worker que roda sozinho. Mas duplicar este bloco no worker
 * seria criar duas réguas de CONSENTIMENTO andando separado — e o dia em que
 * elas divergirem é o dia em que sai PII de lead que não consentiu.
 *
 * Então o núcleo virou lib e os dois importam o MESMO código: a rota manual
 * continua para a liderança conferir, o worker roda no horário.
 *
 * ── A regra que não pode afrouxar ───────────────────────────────────────────
 *
 * Falha FECHADA. Sem política legível, o padrão é EXIGIR consentimento.
 * Ausência de campo, de coluna ou de objeto nunca é lida como consentimento —
 * é "negado" ou "não verificável", e nenhum dos dois entra no lote. A lacuna é
 * contada e declarada em vez de silenciada.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarModoDeEnvio } from "@/lib/meta/modo-de-envio";
import {
  buildCapiLeadEvents,
  isCapiEventCandidate,
  type CapiBatch,
  type CapiDiscardEventRow,
  type CapiLeadRow,
  type CapiOrgConfig,
} from "@/lib/integrations/meta/capi-feedback";


const DAY = 86_400_000;
export const META_SEND_WINDOW_DAYS = 7;

// budget_min/budget_max saíram do select porque orçamento DECLARADO deixou de
// ser valor de venda (lib/integrations/meta/capi-feedback.ts) — carregá-los só
// convidaria a reintroduzir a estimativa.
//
// `sale_value_brl` é o oposto: é o valor APURADO, e é ele que o evento de
// venda usa. Faltava aqui porque a coluna só passou a existir em 2026-07-28 —
// terceiro elo da mesma cadeia partida (coluna ausente → sem porta de entrada
// na tela → fora do select). Sem esta coluna, `buildCapiLeadEvents` lê
// undefined e suprime TODA venda, com a mensagem honesta
// "venda_sem_valor_apurado" — que descreve o sintoma, não a causa.
const LEAD_BASE_SELECT = "id,email,phone,status,score_ia,temperature,campaign_id,created_at,sale_value_brl";
// leads.metadata guarda o consentimento (metadata.meta.dataSharingConsent) e
// NÃO existe em todo ambiente — no banco de produção a coluna não está lá.
// Pedi-la direto no select derrubaria a rota inteira com 42703; por isso a
// disponibilidade é sondada antes e a ausência vira lacuna declarada.
const LEAD_SELECT_WITH_CONSENT = `${LEAD_BASE_SELECT},metadata`;

type ExportLeadRow = CapiLeadRow & { metadata?: unknown };

type ConsentState = "granted" | "denied" | "unverifiable";

/**
 * Estado do consentimento do lead. Ausência de campo, de coluna ou de objeto
 * NUNCA é lida como consentimento — é "negado" ou "não verificável", que
 * suprimem igual mas são contados em separado para o operador saber se o
 * problema é do dado ou do ambiente.
 */
function consentStateOf(lead: ExportLeadRow, columnAvailable: boolean): ConsentState {
  if (!columnAvailable) return "unverifiable";
  const metadata = lead.metadata && typeof lead.metadata === "object" ? lead.metadata as Record<string, unknown> : {};
  const meta = metadata.meta && typeof metadata.meta === "object" ? metadata.meta as Record<string, unknown> : {};
  return meta.dataSharingConsent === true ? "granted" : "denied";
}


// Lição F1: o PostgREST corta silenciosamente no max-rows do servidor (1000 no
// Supabase). Sem .range() explícito o lote perderia linhas sem erro — falso
// "lote completo" numa exportação que será auditada. Paginamos até esgotar,
// com teto de segurança e flag de truncamento honesta.
const PAGE_SIZE = 1000;
const MAX_PAGES = 10;
const ID_CHUNK = 200;

type QueryPage<T> = PromiseLike<{ data: T[] | null; error: { message?: string; code?: string } | null }>;

async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => QueryPage<T>,
): Promise<{ rows: T[]; truncated: boolean; error: { message?: string; code?: string } | null }> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await buildPage(from, from + PAGE_SIZE - 1);
    if (error) return { rows, truncated: false, error };
    if (!data?.length) return { rows, truncated: false, error: null };
    rows.push(...data);
    if (data.length < PAGE_SIZE) return { rows, truncated: false, error: null };
  }
  return { rows, truncated: true, error: null };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

export type ConsentReport = {
  required: boolean;
  policySource: "config" | "default_conservative";
  columnAvailable: boolean;
  suppressedLeads: { denied: number; unverifiable: number };
  suppressedDiscardEvents: number;
};

export type WindowBatch = {
  batch: CapiBatch;
  period: { start: string; end: string; days: number };
  truncated: boolean;
  olderThanSendWindow: number;
  consent: ConsentReport;
  /**
   * TUDO o que o painel precisa mostrar: impedimentos E supressões parciais.
   * Mantido como estava para quem já consome.
   */
  blockers: string[];
  /**
   * ── AVISO NÃO É IMPEDIMENTO ───────────────────────────────────────────────
   *
   * Subconjunto de `blockers` que realmente impede o lote de sair. O worker
   * lia `blockers` inteiro e pulava a organização ao primeiro item — então UMA
   * venda antiga sem valor apurado paralisava o envio de todas as outras.
   *
   * Medido em 2026-07-28: com 2 vendas (uma com valor, uma sem), zero eventos
   * saíam. Numa base de 199 leads sempre haverá alguma sem valor, então o
   * ciclo fechado nunca rodaria — e a mensagem culpava a lead certa pelo
   * sintoma errado.
   *
   * Impede: consentimento não verificável (sem a coluna, ninguém consentiu) e
   * política presumida (sem config, presumir liberação vazaria PII).
   * NÃO impede: lead suprimida por falta de valor ou de consentimento — ela
   * fica de fora, e as demais seguem.
   */
  impedimentos: string[];
};

/**
 * Política de consentimento da organização. Sem linha legível em
 * meta_conversion_configs (tabela que não existe no banco de produção) o
 * default é EXIGIR consentimento: presumir o contrário faria a ausência de
 * configuração autorizar a saída de PII.
 */
async function loadConsentPolicy(supabase: SupabaseClient, organizationId: string) {
  const { data, error } = await supabase
    .from("meta_conversion_configs")
    .select("consent_required")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error || !data) return { required: true, policySource: "default_conservative" as const };
  return { required: data.consent_required !== false, policySource: "config" as const };
}

export async function loadWindowBatch(
  supabase: SupabaseClient,
  organizationId: string,
  days: number,
): Promise<{ ok: true; value: WindowBatch } | { ok: false; step: string; error: { message?: string; code?: string } }> {
  const end = new Date();
  const start = new Date(end.getTime() - days * DAY);
  const since = start.toISOString();

  const [policy, consentProbe] = await Promise.all([
    loadConsentPolicy(supabase, organizationId),
    supabase.from("leads").select("id,metadata").eq("organization_id", organizationId).limit(1),
  ]);
  const consentColumnAvailable = !consentProbe.error;
  const leadSelect = consentColumnAvailable ? LEAD_SELECT_WITH_CONSENT : LEAD_BASE_SELECT;

  const [leadResult, discardResult] = await Promise.all([
    // O select é escolhido em tempo de execução (a coluna de consentimento pode
    // não existir), então o parser de tipos do PostgREST não consegue derivar a
    // linha — o shape é declarado aqui por ExportLeadRow.
    fetchAllRows<ExportLeadRow>((from, to) =>
      supabase
        .from("leads")
        .select(leadSelect)
        .eq("organization_id", organizationId)
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to) as unknown as QueryPage<ExportLeadRow>,
    ),
    fetchAllRows<CapiDiscardEventRow & { id: string }>((from, to) =>
      supabase
        .from("lead_events")
        .select("id,lead_id,metadata,created_at")
        .eq("organization_id", organizationId)
        .eq("event_type", "lead_discarded")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);
  if (leadResult.error) return { ok: false, step: "leads", error: leadResult.error };
  if (discardResult.error) return { ok: false, step: "lead_events", error: discardResult.error };

  // Descarte na janela pode apontar para lead criado ANTES da janela — os
  // identificadores desse lead precisam ser carregados à parte (em chunks,
  // paginados) para o evento LeadDisqualified não ser perdido.
  const windowLeadIds = new Set(leadResult.rows.map((lead) => lead.id));
  const missingIds = [...new Set(
    discardResult.rows
      .map((row) => row.lead_id)
      .filter((value): value is string => Boolean(value) && !windowLeadIds.has(value as string)),
  )];
  const extraLeads: ExportLeadRow[] = [];
  for (const ids of chunk(missingIds, ID_CHUNK)) {
    const extraResult = await fetchAllRows<ExportLeadRow>((from, to) =>
      supabase
        .from("leads")
        .select(leadSelect)
        .eq("organization_id", organizationId)
        .in("id", ids)
        .order("id", { ascending: true })
        .range(from, to) as unknown as QueryPage<ExportLeadRow>,
    );
    if (extraResult.error) return { ok: false, step: "leads_by_id", error: extraResult.error };
    extraLeads.push(...extraResult.rows);
  }

  // Leads fora da janela entram SOMENTE como fonte de identificadores para os
  // descartes: score/temperatura/status neutralizados para o builder não gerar
  // QualifiedLead/ConvertedLead retroativos com event_time fora da janela.
  const identifierOnlyLeads: ExportLeadRow[] = extraLeads
    .filter((lead) => !windowLeadIds.has(lead.id))
    .map((lead) => ({
      id: lead.id,
      email: lead.email,
      phone: lead.phone,
      campaign_id: lead.campaign_id,
      // metadata segue junto: mesmo entrando só como fonte de identificador, é
      // a PII deste lead que viajaria no evento de descarte, então o
      // consentimento dele também precisa ser avaliado.
      metadata: lead.metadata,
      status: null,
      score_ia: null,
      temperature: null,
      created_at: null,
    }));

  // Id da campanha NA META por lead: o builder só pode emitir
  // custom_data.campaign_id com o id externo, nunca com o uuid interno do CRM
  // (que a Meta não reconhece e que não deve vazar para terceiro). A leitura é
  // tolerante: sem marketing_campaigns legível o campo simplesmente fica nulo,
  // e nenhum evento é perdido por causa disso.
  const allLeads = [...leadResult.rows, ...identifierOnlyLeads];
  const campaignIds = [...new Set(allLeads.map((lead) => lead.campaign_id).filter(Boolean))] as string[];
  const externalByCampaignId = new Map<string, string>();
  for (const ids of chunk(campaignIds, ID_CHUNK)) {
    const campaignResult = await supabase
      .from("marketing_campaigns")
      .select("id,external_campaign_id")
      .eq("organization_id", organizationId)
      .in("id", ids);
    for (const row of campaignResult.data ?? []) {
      const external = String(row.external_campaign_id ?? "").trim();
      if (external) externalByCampaignId.set(String(row.id), external);
    }
  }

  // Consentimento: MESMA régua do caminho automático (lib/meta/conversions.ts),
  // que já bloqueia quando falta consentimento. Sem isto, este caminho — o
  // único que envia sinal sem test_event_code — hasheava e-mail e telefone de
  // qualquer lead da janela. Falha FECHADA: quem não tem consentimento
  // verificado não entra no lote, e a lacuna é contada e declarada.
  const suppressedLeads = { denied: 0, unverifiable: 0 };
  const allowedLeads = policy.required
    ? allLeads.filter((lead) => {
        const state = consentStateOf(lead, consentColumnAvailable);
        if (state === "granted") return true;
        // Só conta quem realmente geraria evento — contar a janela inteira
        // inflaria a lacuna e mentiria sobre o tamanho do problema.
        if (isCapiEventCandidate(lead)) {
          if (state === "unverifiable") suppressedLeads.unverifiable += 1;
          else suppressedLeads.denied += 1;
        }
        return false;
      })
    : allLeads;

  const knownLeadIds = new Set(allLeads.map((lead) => lead.id));
  const allowedLeadIds = new Set(allowedLeads.map((lead) => lead.id));
  let suppressedDiscardEvents = 0;
  const allowedDiscards = discardResult.rows.filter((row) => {
    // O evento de descarte carrega a PII hasheada do lead — sem consentimento
    // dele, o descarte também não sai. Lead desconhecido segue para o builder,
    // que já o contabiliza em skipped.discardLeadMissing.
    if (!row.lead_id || !knownLeadIds.has(row.lead_id)) return true;
    if (allowedLeadIds.has(row.lead_id)) return true;
    suppressedDiscardEvents += 1;
    return false;
  });

  const batch = buildCapiLeadEvents({
    organizationId,
    leads: allowedLeads.map((lead) => ({
      ...lead,
      campaign_external_id: lead.campaign_id ? externalByCampaignId.get(lead.campaign_id) ?? null : null,
      // Não há no banco vivo fonte de valor APURADO de venda (a tabela
      // opportunities não existe em produção e nenhum caminho do repositório a
      // escreve), então o campo vai ausente de propósito: o builder suprime e
      // conta a venda em vez de estimar valor.
    })),
    discardEvents: allowedDiscards,
  });

  const sendWindowFloor = Math.floor((Date.now() - META_SEND_WINDOW_DAYS * DAY) / 1000);
  const olderThanSendWindow = batch.events.filter((event) => event.event_time < sendWindowFloor).length;

  // `batch.blockers` traz supressões PARCIAIS (ex.: venda sem valor apurado):
  // avisam, não impedem. Os dois abaixo são de outra natureza — sem eles
  // NENHUM evento pode sair — e por isso entram também em `impedimentos`.
  const blockers = [...batch.blockers];
  const impedimentos: string[] = [];
  if (policy.required && !consentColumnAvailable) {
    const motivo = "consentimento_nao_verificavel: leads.metadata não está disponível neste banco, então nenhum consentimento pôde ser verificado e NENHUM evento pode sair. Aplique a migration que cria a coluna antes de esperar lote.";
    blockers.push(motivo);
    impedimentos.push(motivo);
  }
  if (policy.required && policy.policySource === "default_conservative") {
    const motivo = "politica_de_consentimento_presumida: meta_conversion_configs não está legível para esta organização — o export assume consentimento OBRIGATÓRIO até que a configuração exista.";
    blockers.push(motivo);
    impedimentos.push(motivo);
  }
  if (suppressedLeads.denied > 0 || suppressedDiscardEvents > 0) {
    blockers.push(
      `consentimento_ausente: ${suppressedLeads.denied} lead(s) e ${suppressedDiscardEvents} descarte(s) ficaram fora do lote por não terem consentimento de compartilhamento registrado.`,
    );
  }

  return {
    ok: true,
    value: {
      batch,
      period: { start: since, end: end.toISOString(), days },
      truncated: leadResult.truncated || discardResult.truncated,
      olderThanSendWindow,
      consent: {
        required: policy.required,
        policySource: policy.policySource,
        columnAvailable: consentColumnAvailable,
        suppressedLeads,
        suppressedDiscardEvents,
      },
      blockers,
      impedimentos,
    },
  };
}


/**
 * Config de envio da organização. `null` quando não há linha — e ausência de
 * linha NÃO vira envio: é o mesmo princípio do consentimento.
 */
export async function loadOrgCapiConfig(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<CapiOrgConfig | null> {
  const { data } = await supabase
    .from("meta_conversion_configs")
    .select("dataset_id,mode,enabled,test_event_code")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!data?.dataset_id) return null;
  return {
    datasetId: String(data.dataset_id),
    // Qualquer valor que não seja exatamente "live" é tratado como teste.
    // Errar para o lado do teste custa um evento não contabilizado; errar para
    // o outro contamina a otimização real. A regra mora em um lugar só porque
    // esta era a terceira cópia dela — e cópias de regra de modo foi
    // exatamente como o remetente e a fila passaram a discordar.
    mode: normalizarModoDeEnvio(data.mode),
    testEventCode: data.test_event_code ?? null,
    enabled: data.enabled === true,
  };
}
