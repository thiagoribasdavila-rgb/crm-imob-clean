"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/atlas/page-header";
import { AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";

/*
 * CC-6 · Hub de marketing vivo — menos ruído, mais informação por pixel.
 * Consome cost-report (números + plano da IA + verba), andromeda (saúde
 * criativa, pode não existir ainda) e calibration (transparência das IAs).
 * Refresh silencioso a cada 60s; satélites viram uma linha de chips no rodapé.
 */

type AggRow = { key: string; label: string; spend: number; leads: number; sales: number; cpl: number | null; cac: number | null; share: number };
type Pacing = "abaixo" | "no_ritmo" | "estourando" | "estourou";
type BudgetRow = {
  product: string; developer: string; weeklyBudget: number; spent: number; remaining: number;
  pctUsed: number; cac: number | null; targetCac: number | null; pacing: Pacing;
  verdict: "eficiente" | "caro" | "sem_dados"; recommendation: string;
};
type MoveKind = "escalar" | "pausar" | "revisar" | "definir_meta" | "realocar" | "manter";
type Move = { kind: MoveKind; scope: string; target: string; reason: string; amount?: number; priority: number };
type Coverage = {
  window: string;
  spendTruncated: boolean;
  leadsTruncated: boolean;
  campaignsTruncated: boolean;
  complete: boolean;
};
// Elo de atribuição por campanha (uuid → contagem). leadsUnlinked > 0 significa
// que existem leads da mesma campanha SEM campaign_id: ali "0 vendas" é
// ausência de medição. null = não medido neste banco, que também não é zero.
type Attribution = {
  measurable: boolean;
  basis: string;
  byCampaign: Record<string, { leadsLinked: number; leadsUnlinked: number | null }>;
};
type CostReport = {
  source?: string;
  // Cobertura das consultas paginadas: quando incompleta a tela AVISA — número
  // de vendas truncado em silêncio é pior que número ausente.
  coverage?: Coverage;
  attribution?: Attribution;
  totals: { spend: number; campaigns: number };
  byCampaign: { aggregate: AggRow[] };
  byProject: { aggregate: AggRow[] };
  byDeveloper: { aggregate: AggRow[] };
  budget: BudgetRow[];
  plan: { moves: Move[]; summary: { desperdicioSemanal: number; economiaPotencial: number; produtosEficientes: number; produtosCaros: number } };
  projection?: { projections: MoveProjection[] };
};
// assumptions: as premissas que sustentam a faixa. Sem elas, "+3 a +5 leads/sem"
// é número sem lastro visível — o mesmo padrão que o forecast já respeita.
type MoveProjection = { moveKind: string; target: string; weeklyLeadsDelta: { pessimista: number; esperado: number; otimista: number }; confidence: "baixa" | "media" | "alta"; assumptions?: string[] };
type Fatigue = { adId: string; adName: string; kind: string; detail: string };
type Health = { campaignId: string; campaignName: string; activeAds: number; diversityScore: number; fatigue: Fatigue[]; andromedaScore: number };
// Par completo da rotação: o anúncio a pausar E o substituto já redigido pelo
// estrategista. Sem o copy na tela o gestor não tem o que aprovar — a
// governança "a IA propõe, o humano aprova" ficava travada por falta de
// proposta visível.
type Rotation = {
  campaignName: string;
  pauseAd?: { adId: string; adName: string; signals: string[] };
  replacement: { angle: string; copy?: { primaryText: string; headline: string; description: string } };
  reason: string;
  priority?: number;
};
type Forecast = { account: { pace: "acelerando" | "estavel" | "desacelerando"; projectedWeeklyLeads: { pessimista: number; esperado: number; otimista: number }; projectedCpl: number | null; trendPct: number; confidence: "baixa" | "media" | "alta"; assumptions: string[] }; anomalies: string[]; weeks?: Array<{ weekStart: string; spend: number; leads: number }> };
// Localizador de Público — a rota /marketing/andromeda JÁ devolvia isto (audience-finder
// + policy-engine) e a tela descartava. Sob HOUSING a demografia é OBSERVAÇÃO da entrega,
// nunca alvo: por isso o painel mostra o policyNote junto.
type PlacementLine = { platform: string; position: string; spend: number; leads: number; cpl: number | null; sharePct: number; verdict: "escalar" | "manter" | "revisar" | "descartar"; reason: string };
type GeoReport = { leak: { sharePct: number; topRegions: Array<{ region: string; spend: number; leads: number }> }; verdict: "focado" | "vazando" };
type DemoLine = { age: string; gender: string; spend: number; leads: number; cpl?: number | null; sharePct?: number };
// angles: CPL por ângulo criativo (audience-finder). É o único sinal que liga
// CONTEÚDO da peça a resultado, e vinha sendo descartado por omissão de tipo.
type AngleLine = { angle: string; product: string; spend: number; leads: number; cpl: number | null; ads: number };
type Audience = { placements: PlacementLine[]; geo: GeoReport | null; demo: { lines: DemoLine[]; policyNote: string } | null; angles?: AngleLine[] };
// Prescrição do policy-engine. kind/target dizem O QUE fazer; o que sustenta a
// decisão vinha na rota e a tela jogava fora: `evidence` (o número medido),
// `expectedEffect` (o que se espera), `confidence` e `targetId` — o id do
// anúncio, único jeito de a prescrição virar ação em vez de opinião.
// Nota de campo: a rota devolve `rationale`; `reason` fica declarado como
// leitura tolerante do MESMO texto porque scripts/check-audience-ui.mjs (caso
// 10) trava esse nome e scripts/ é intocável nesta entrega — ver relatório.
type Prescription = {
  kind: string;
  target: string;
  targetId?: string;
  confidence?: "media" | "alta";
  reversible?: boolean;
  rationale?: string;
  reason?: string;
  evidence?: string;
  expectedEffect?: string;
  priority?: number;
};
type Andromeda = { source: string; health: Health[]; consolidation: { verdict: "consolidada" | "fragmentada"; reason: string }; forecast?: Forecast; rotations?: { proposals: Rotation[]; summary: string }; audience?: Audience; prescriptions?: { proposals: Prescription[]; summary: string } };
type Calibration = { summary: string[] };

/**
 * Desempenho por campanha medido pelo CRM — não pela Meta.
 *
 * Esta é a metade da verdade que não depende de token nenhum: quantas leads a
 * campanha trouxe, quantas foram atendidas, quantas avançaram. Gasto, CPL e
 * impressão vêm da API de anúncios e chegam como null enquanto ela não estiver
 * conectada; null é honesto, zero seria mentira.
 */
/**
 * Descoberta de formulários da Meta. Não entra no carregamento automático: é
 * ação sob demanda da liderança, e a primeira resposta é sempre simulação.
 */
/**
 * Fila de represadas: o que já foi pago e ainda não entrou no CRM.
 * Liberar é ato do diretor — cada lead liberada nasce com relógio correndo.
 */
/**
 * Veredito do stop loss. `executaSozinho: false` viaja no payload de propósito:
 * a tela precisa poder afirmar, sem interpretar, que nada foi executado.
 */
type StopLoss = {
  acao: "seguir" | "reduzir" | "pausar";
  resumo: string;
  orcamento: { teto: number | null; gasto: number | null; cplAlvo: number | null };
  decisoes: Array<{ regra: string; acao: string; motivo: string; proposta: string; gravidade: number }>;
  naoAvaliado: string[];
  ressalvas: string[];
  governanca: { executaSozinho: boolean; exigeAprovacaoHumana: boolean; onde: string };
};

type FilaDeRepresadas = {
  disponivel: boolean;
  motivo?: string;
  totalRepresado: number;
  formulariosComRepresa: number;
  podeLiberar: boolean;
  aviso: string | null;
  represadas: Array<{
    formId: string; nome: string | null;
    leadsNaMeta: number; jaEntraram: number; represadas: number;
    registrada: boolean; ativa: boolean; descartaLeadNova: boolean;
  }>;
};

type DescobertaDeFormularios = {
  simulacao: boolean;
  encontradosNaMeta: number;
  leadsAcumuladosNaMeta: number;
  jaRegistrados: number;
  registrados: number;
  novos: Array<{ formId: string; nome: string | null; leads: number }>;
  fontesOrfas: Array<{ formId: string; nome: string | null; ativa: boolean }>;
  avisos: string[];
};

type CampaignPerformance = {
  linhas: Array<{
    campanha: string; conjunto: string | null; anuncio: string | null; formulario: string | null;
    canal: string | null; empreendimento: string | null;
    leads: number; comDono: number; contatados: number; avancaram: number; ganhos: number; perdidos: number;
    taxaContato: number | null; taxaAvanco: number | null;
    gasto: number | null; cpl: number | null;
  }>;
  resumo: { campanhas: number; leadsAtribuidas: number; contatadas: number; avancaram: number; ganhos: number };
  alertas: Array<{ nivel: "critico" | "atencao"; titulo: string; detalhe: string; acao: string }>;
  metricasDeMidia: { disponivel: boolean; motivo: string; proximaAcao: string };
};

type FetchState<T> =
  | { status: "loading" }
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "waiting" }
  | { status: "error"; message: string };

async function fetchApi<T>(path: string): Promise<FetchState<T>> {
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const response = await fetch(path, {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (response.status === 403) return { status: "forbidden" };
    if (response.status === 404 || response.status === 503) return { status: "waiting" };
    const json = (await response.json()) as { ok: boolean; data?: T; error?: { message?: string } };
    if (!response.ok || !json.ok || !json.data) return { status: "error", message: json.error?.message ?? "Resposta inválida da API" };
    return { status: "ok", data: json.data };
  } catch {
    return { status: "error", message: "Falha de rede ao consultar o hub" };
  }
}

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const clock = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

const MOVE_META: Record<MoveKind, { label: string; ink: string }> = {
  escalar: { label: "Escalar", ink: "cc6-ok" },
  pausar: { label: "Pausar", ink: "cc6-crit" },
  revisar: { label: "Revisar", ink: "cc6-warn" },
  definir_meta: { label: "Definir meta", ink: "" },
  realocar: { label: "Realocar", ink: "" },
  manter: { label: "Manter", ink: "" },
};
const PACING_META: Record<Pacing, { label: string; sev: string }> = {
  abaixo: { label: "abaixo do ritmo", sev: "#6b7890" },
  no_ritmo: { label: "no ritmo", sev: "#34d399" },
  estourando: { label: "estourando", sev: "#f5b544" },
  estourou: { label: "estourou", sev: "#fb7185" },
};
const VERDICT_INK: Record<BudgetRow["verdict"], string> = { eficiente: "cc6-ok", caro: "cc6-crit", sem_dados: "" };
// Rótulos das prescrições do policy-engine (PolicyKind). Fora do mapa, o kind
// cru vira rótulo legível — nunca some por não estar previsto aqui.
const PRESCRIPTION_META: Record<string, { label: string; ink: string }> = {
  pausar_placement: { label: "Pausar placement", ink: "cc6-crit" },
  pausar_criativo: { label: "Pausar criativo", ink: "cc6-crit" },
  renovar_criativo: { label: "Renovar criativo", ink: "cc6-warn" },
  consolidar_conta: { label: "Consolidar conta", ink: "" },
  revisar_geo: { label: "Revisar geo", ink: "cc6-warn" },
};

type Dim = "byCampaign" | "byProject" | "byDeveloper";
const DIMS: Array<{ id: Dim; label: string }> = [
  { id: "byCampaign", label: "Campanha" },
  { id: "byProject", label: "Projeto" },
  { id: "byDeveloper", label: "Incorporador" },
];

const SATELLITES: Array<{ href: string; label: string }> = [
  { href: "/marketing/budget", label: "budget" },
  { href: "/marketing/campaigns", label: "campaigns" },
  { href: "/marketing/creatives", label: "creatives" },
  { href: "/marketing/experiments", label: "experiments" },
  { href: "/marketing/campaign-intelligence", label: "intelligence" },
];

// Cartão de estado honesto para 403 / 404 / 503 / erro de rede.
function GateCard({ state, onRetry, waiting }: { state: FetchState<unknown>; onRetry: () => void; waiting: string }) {
  if (state.status === "forbidden")
    return (
      <div className="cc6-panel-quiet p-4">
        <p className="cc6-eyebrow">Visão da liderança</p>
        <p className="mt-1.5 text-sm leading-6 text-[#aab6ca]">
          Este painel consolida investimento e decisões de verba — acesso restrito a gestores.
        </p>
      </div>
    );
  if (state.status === "waiting")
    return <p className="cc6-panel-quiet p-4 text-sm leading-6 text-[#6b7890]">{waiting}</p>;
  if (state.status === "error")
    return <AtlasRecoverableError description={state.message} onRetry={onRetry} scope="module" />;
  return null;
}

export default function MarketingPage() {
  const [cost, setCost] = useState<FetchState<CostReport>>({ status: "loading" });
  const [andromeda, setAndromeda] = useState<FetchState<Andromeda>>({ status: "loading" });
  const [calibration, setCalibration] = useState<FetchState<Calibration>>({ status: "loading" });
  const [stopLoss, setStopLoss] = useState<StopLoss | null>(null);

  /**
   * ETAPAS DA AGÊNCIA.
   *
   * A tela acumulou 14 painéis num scroll só — decisão de verba, entrada de
   * lead, desempenho, criativo e prescrição, tudo junto. Cada um foi útil
   * sozinho; empilhados, viram um relatório que ninguém termina de ler.
   *
   * O ciclo de uma agência tem ordem: decidir se compra, garantir que a lead
   * entra, medir o que voltou, cuidar do criativo, e só então agir. As etapas
   * respeitam essa ordem e mostram UMA de cada vez.
   */
  const [etapa, setEtapa] = useState<"decidir" | "entrada" | "desempenho" | "criativo" | "agir">("decidir");
  // Cada seção declara a que etapa pertence; `hidden` é atributo nativo, então
  // leitor de tela e busca do navegador respeitam junto — esconder por CSS
  // deixaria o conteúdo acessível a quem não pediu por ele.
  const foraDaEtapa = (dona: typeof etapa) => (etapa === dona ? undefined : true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dim, setDim] = useState<Dim>("byCampaign");
  // Id do anúncio copiado da prescrição. É a única "ação" desta tela: leva o
  // alvo executável para a plataforma/aprovação. Nada é pausado daqui.
  const [copiedTargetId, setCopiedTargetId] = useState<string | null>(null);
  const [performance, setPerformance] = useState<FetchState<CampaignPerformance>>({ status: "loading" });
  const [formularios, setFormularios] = useState<DescobertaDeFormularios | null>(null);
  const [descobrindo, setDescobrindo] = useState(false);
  const [represa, setRepresa] = useState<FilaDeRepresadas | null>(null);
  const [carregandoRepresa, setCarregandoRepresa] = useState(false);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [liberando, setLiberando] = useState(false);
  const [resultadoDaLiberacao, setResultadoDaLiberacao] = useState<string[] | null>(null);

  async function carregarRepresa() {
    setCarregandoRepresa(true);
    setResultadoDaLiberacao(null);
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const r = await fetch("/api/v1/marketing/held-leads", {
        headers: { Authorization: `Bearer ${sessao.session?.access_token || ""}` },
      });
      const corpo = await r.json();
      if (r.ok) setRepresa(corpo.data as FilaDeRepresadas);
    } finally {
      setCarregandoRepresa(false);
    }
  }

  async function liberarSelecionados(distribuir: boolean) {
    if (!selecionados.length) return;
    setLiberando(true);
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const r = await fetch("/api/v1/marketing/held-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessao.session?.access_token || ""}` },
        body: JSON.stringify({ formIds: selecionados, distribuir }),
      });
      const corpo = await r.json();
      const d = corpo?.data;
      setResultadoDaLiberacao(
        r.ok
          ? [`${d?.aceitas ?? 0} lead(s) liberadas de ${d?.formulariosAtivados?.length ?? 0} formulário(s).`, d?.proximoPasso, ...(d?.avisos ?? [])].filter(Boolean)
          : [corpo?.error?.message || "Não foi possível liberar."],
      );
      setSelecionados([]);
      await carregarRepresa();
    } finally {
      setLiberando(false);
    }
  }
  // Estado por REGRA, não global: o diretor pode levar "CPL acima do alvo" para
  // aprovação e deixar as outras decisões de lado. Um único `enviando` faria as
  // três linhas piscarem juntas.
  const [propondo, setPropondo] = useState<string | null>(null);
  const [propostas, setPropostas] = useState<Record<string, string>>({});

  /**
   * Leva uma decisão do stop loss para /approvals.
   *
   * Manda só a `regra`. O texto, o valor e a ação são remedidos no servidor —
   * se a tela pudesse ditar o conteúdo, o stop loss viraria formulário livre
   * com cara de análise.
   */
  async function levarParaAprovacao(regra: string) {
    setPropondo(regra);
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const r = await fetch("/api/v1/marketing/stop-loss", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessao.session?.access_token || ""}` },
        body: JSON.stringify({ regra }),
      });
      const corpo = await r.json();
      setPropostas((atual) => ({
        ...atual,
        [regra]: r.ok
          ? (corpo?.data?.jaExistia ? "Já estava na caixa de aprovações." : "Enviado para /approvals.")
          : (corpo?.error?.message || "Não foi possível enviar."),
      }));
    } catch {
      setPropostas((atual) => ({ ...atual, [regra]: "Falha de rede ao enviar." }));
    } finally {
      setPropondo(null);
    }
  }

  const [erroDaDescoberta, setErroDaDescoberta] = useState<string | null>(null);

  async function descobrirFormularios(aplicar: boolean) {
    setDescobrindo(true);
    setErroDaDescoberta(null);
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const resposta = await fetch("/api/v1/integrations/meta/discover-forms", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessao.session?.access_token || ""}` },
        body: JSON.stringify({ aplicar }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo?.error?.message || "Não foi possível ler os formulários da Meta.");
      setFormularios(corpo.data as DescobertaDeFormularios);
    } catch (falha) {
      setErroDaDescoberta(falha instanceof Error ? falha.message : "Falha na descoberta.");
    } finally {
      setDescobrindo(false);
    }
  }

  useEffect(() => {
    let active = true;
    // Refresh silencioso: um erro transitório nunca apaga o último dado bom.
    const keep = <T,>(previous: FetchState<T>, next: FetchState<T>): FetchState<T> =>
      next.status === "error" && previous.status === "ok" ? previous : next;
    async function load() {
      const [costNext, andromedaNext, calibrationNext, performanceNext, stopLossNext] = await Promise.all([
        fetchApi<CostReport>("/api/v1/marketing/cost-report"),
        fetchApi<Andromeda>("/api/v1/marketing/andromeda"),
        fetchApi<Calibration>("/api/v1/ai/calibration"),
        fetchApi<CampaignPerformance>("/api/v1/marketing/campaign-performance"),
        fetchApi<StopLoss>("/api/v1/marketing/stop-loss"),
      ]);
      if (!active) return;
      setCost((previous) => keep(previous, costNext));
      setAndromeda((previous) => keep(previous, andromedaNext));
      setCalibration((previous) => keep(previous, calibrationNext));
      setPerformance((previous) => keep(previous, performanceNext));
      if (stopLossNext.status === "ok") {
        setStopLoss(stopLossNext.data);
        // Abre onde a atenção é necessária. Sem gatilho, a pergunta do dia a dia
        // é desempenho — não "devo parar?", que já foi respondida com um não.
        setEtapa((atual) => (atual === "decidir" && stopLossNext.data.acao === "seguir" ? "desempenho" : atual));
      }
      if (costNext.status === "ok") setUpdatedAt(new Date());
    }
    load();
    const timer = setInterval(load, 60_000);
    return () => { active = false; clearInterval(timer); };
  }, [reloadKey]);

  const retry = () => setReloadKey((value) => value + 1);
  // Falha de clipboard (contexto inseguro, permissão negada) não vira sucesso
  // silencioso: o rótulo simplesmente não muda e o id continua visível na tela.
  const copyTargetId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedTargetId(id);
    } catch {
      setCopiedTargetId(null);
    }
  };
  const report = cost.status === "ok" ? cost.data : null;
  const rows = useMemo(() => (report ? report[dim].aggregate : []), [report, dim]);
  const leads = useMemo(() => (report ? report.byCampaign.aggregate.reduce((sum, row) => sum + row.leads, 0) : 0), [report]);
  const moves = useMemo(
    () => (report ? [...report.plan.moves].sort((a, b) => a.priority - b.priority).slice(0, 5) : []),
    [report],
  );
  // Venda/CAC/CPL de uma campanha só valem quando TODOS os leads dela estão
  // presos a ela. Com lead órfão (ou com a medição indisponível), imprimir "0
  // vendas" é apresentar cegueira de atribuição como resultado. A linha na
  // dimensão campanha passa a mostrar "—" com o motivo no title; a CONTAGEM de
  // leads continua visível, porque ela é fato observado.
  const attributionOf = (rowKey: string): { leadsUnlinked: number | null } | null => {
    if (dim !== "byCampaign" || !report?.attribution) return null;
    const entry = report.attribution.byCampaign[rowKey];
    if (!entry) return null;
    return entry.leadsUnlinked === 0 ? null : { leadsUnlinked: entry.leadsUnlinked };
  };
  const attributionNote = (leadsUnlinked: number | null) =>
    leadsUnlinked === null
      ? "Não foi possível medir quantos leads desta campanha ficaram sem elo de atribuição neste banco — o número não é 0, é desconhecido."
      : `${leadsUnlinked} lead(s) com o id externo desta campanha estão SEM elo de atribuição. Venda e custo por venda aqui seriam ausência de medição, não resultado.`;

  const strip: Array<{ label: string; value: string }> = report
    ? [
        { label: "Investimento", value: money.format(report.totals.spend) },
        { label: "Leads", value: String(leads) },
        { label: "CPL médio", value: leads > 0 ? money.format(report.totals.spend / leads) : "—" },
        { label: "Campanhas", value: String(report.totals.campaigns) },
      ]
    : [];

  return (
    <div className="space-y-4 pb-10" data-marketing-layout="cc6-live-hub">
      <PageHeader
        eyebrow="Marketing · Andromeda"
        title="Hub de marketing"
        description="Verba, decisões da IA e saúde criativa em uma tela — a venda consolida no CRM."
      />

      {/* Linha de estado: fonte viva + timestamp discreto. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {report?.source === "meta_live" ? (
          <span className="cc6-chip text-[var(--atlas-accent)]">dados vivos da Meta · venda consolida no CRM</span>
        ) : null}
        {updatedAt ? (
          <span className="cc6-num text-[11px] text-[#6b7890]" aria-live="polite">
            atualizado {clock.format(updatedAt)} · refresh 60s
          </span>
        ) : null}
      </div>

      {cost.status === "loading" ? (
        <div className="space-y-4" aria-busy="true">
          <AtlasSkeleton className="h-20 w-full" />
          <AtlasSkeleton className="h-48 w-full" />
          <AtlasSkeleton className="h-64 w-full" />
        </div>
      ) : null}
      <GateCard state={cost} onRetry={retry} waiting="Relatório de custos aguardando ativação do banco." />

      {report?.coverage && !report.coverage.complete ? (
        <p role="status" className="cc6-panel-quiet cc6-reveal px-4 py-3 text-[12.5px] leading-5 text-[#f2b544]">
          ⚠️ Leitura incompleta: {[
            report.coverage.leadsTruncated ? "leads/vendas" : null,
            report.coverage.spendTruncated ? "investimento" : null,
            report.coverage.campaignsTruncated ? "campanhas" : null,
          ].filter(Boolean).join(", ")} atingiram o teto de paginação. Os números abaixo são MÍNIMOS
          observados, não totais — não decida pausa de campanha por eles.
        </p>
      ) : null}

      {/* ETAPAS — o ciclo da agência, uma de cada vez.
          O contador ao lado de "Decidir" é o único que precisa gritar: quando o
          stop loss aciona, ele aparece mesmo com o operador em outra etapa. */}
      <nav aria-label="Etapas da operação de mídia" className="atlas-etapas">
        {([
          ["decidir", "Decidir", stopLoss && stopLoss.acao !== "seguir" ? stopLoss.decisoes.length : 0],
          ["entrada", "Entrada", represa?.disponivel ? represa.totalRepresado : 0],
          ["desempenho", "Desempenho", 0],
          ["criativo", "Criativo", 0],
          ["agir", "Agir", 0],
        ] as const).map(([chave, rotulo, alerta]) => (
          <button
            key={chave}
            type="button"
            onClick={() => setEtapa(chave)}
            data-ativa={etapa === chave ? "true" : undefined}
            data-alerta={alerta > 0 ? "true" : undefined}
            aria-current={etapa === chave ? "step" : undefined}
          >
            {rotulo}
            {alerta > 0 ? <span className="cc6-num">{alerta}</span> : null}
          </button>
        ))}
      </nav>

      {/* STOP LOSS — primeiro de tudo. Se a recomendação é parar de comprar,
          nenhum outro número desta tela deve ser lido antes. */}
      {stopLoss ? (
        <section
          aria-label="Stop loss de verba" hidden={foraDaEtapa("decidir")}
          data-acao={stopLoss.acao}
          className="atlas-stop-loss cc6-reveal"
        >
          <div className="atlas-stop-loss-head">
            <span className="atlas-stop-loss-flag">
              {stopLoss.acao === "pausar" ? "PARAR" : stopLoss.acao === "reduzir" ? "REDUZIR" : "SEGUIR"}
            </span>
            <p>{stopLoss.resumo}</p>
            {stopLoss.orcamento.teto ? (
              <span className="atlas-stop-loss-budget cc6-num">
                {stopLoss.orcamento.gasto === null ? "gasto não lido" : stopLoss.orcamento.gasto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                {" / "}
                {stopLoss.orcamento.teto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            ) : null}
          </div>

          {stopLoss.decisoes.length ? (
            <ul className="atlas-stop-loss-list">
              {stopLoss.decisoes.map((d) => (
                <li key={d.regra} data-acao={d.acao}>
                  <p className="atlas-stop-loss-why">{d.motivo}</p>
                  <p className="atlas-stop-loss-what">{d.proposta}</p>
                  {/* O botão que fechava o ciclo pela metade: a IA media e
                      redigia, e a proposta tinha de ser reescrita à mão em
                      /approvals. Recomendação que exige redigitação não vira
                      ação em dia corrido. */}
                  <div className="atlas-stop-loss-acao">
                    <button
                      type="button"
                                            onClick={() => levarParaAprovacao(d.regra)}
                      disabled={propondo === d.regra || Boolean(propostas[d.regra])}
                    >
                      {propondo === d.regra ? "Enviando…" : "Levar para aprovação"}
                    </button>
                    {propostas[d.regra] ? (
                      <span className="atlas-stop-loss-feito">{propostas[d.regra]}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {[...stopLoss.naoAvaliado, ...stopLoss.ressalvas].length ? (
            <details className="atlas-stop-loss-gaps">
              <summary>{stopLoss.naoAvaliado.length + stopLoss.ressalvas.length} regra(s) sem dado para avaliar</summary>
              {[...stopLoss.naoAvaliado, ...stopLoss.ressalvas].map((linha) => (
                <p key={linha}>{linha}</p>
              ))}
            </details>
          ) : null}

          {/* A frase que impede a leitura errada: nada foi executado. */}
          <p className="atlas-stop-loss-rule">
            Recomendação, não execução. Nenhuma campanha foi pausada e nenhuma verba foi alterada.
            Enviar leva a decisão redigida para <a href={stopLoss.governanca.onde}>/approvals</a>, onde
            a liderança autoriza — e a mudança na Meta continua sendo um passo à parte.
          </p>
        </section>
      ) : null}

      {/* Fila de represadas: lead que já custou verba e não está na operação.
          Vem primeiro porque é o maior valor parado — e porque liberar sem
          decidir a distribuição só troca "lead parada" por "SLA vencido". */}
      <section aria-label="Leads represadas" hidden={foraDaEtapa("entrada")} className="cc6-panel cc6-reveal overflow-hidden">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2 px-5 pb-3 pt-4">
          <p className="cc6-eyebrow">Leads represadas</p>
          {represa?.disponivel ? (
            <p className="cc6-num ml-auto text-[11px] text-[#6b7890]">
              {represa.totalRepresado} lead(s) fora do CRM · {represa.formulariosComRepresa} formulário(s)
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void carregarRepresa()}
            disabled={carregandoRepresa}
            className={`min-h-9 rounded-lg border border-white/10 px-3 text-[11px] font-semibold text-[#cdd7e5] transition hover:border-white/25 hover:text-white disabled:opacity-50 ${represa?.disponivel ? "" : "ml-auto"}`}
          >
            {carregandoRepresa ? "Apurando…" : represa ? "Atualizar" : "Apurar represa"}
          </button>
        </div>

        {!represa ? (
          <p className="px-5 pb-4 text-[12px] leading-5 text-[#6b7890]">
            Mostra quantas leads já pagas estão na Meta e ainda não entraram no CRM, formulário a
            formulário. Liberar é ato da diretoria: cada lead liberada nasce com o relógio de
            primeiro contato correndo.
          </p>
        ) : !represa.disponivel ? (
          <p className="px-5 pb-4 text-[12px] leading-5 text-[#6b7890]">{represa.motivo}</p>
        ) : !represa.represadas.length ? (
          <p className="px-5 pb-4 text-[12px] leading-5 text-[#93a2b8]">
            Nenhuma lead represada — tudo que a Meta tem já está no CRM.
          </p>
        ) : (
          <>
            {represa.aviso ? (
              <p className="mx-5 mb-3 rounded-xl border border-[rgba(245,181,68,0.28)] bg-[rgba(245,181,68,0.05)] px-4 py-3 text-[12px] leading-5 text-[#f2b544]">
                {represa.aviso}
              </p>
            ) : null}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-[12px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[.12em] text-[#6b7890]">
                    <th className="px-5 py-2 font-semibold">Formulário</th>
                    <th className="px-3 py-2 text-right font-semibold">Represadas</th>
                    <th className="px-3 py-2 text-right font-semibold">Já entraram</th>
                    <th className="px-5 py-2 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {represa.represadas.slice(0, 12).map((linha) => (
                    <tr key={linha.formId} className="border-t border-white/5">
                      <td className="px-5 py-2.5">
                        <label className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={selecionados.includes(linha.formId)}
                            disabled={!represa.podeLiberar || !linha.registrada}
                            onChange={(e) => setSelecionados((atual) => e.target.checked
                              ? [...atual, linha.formId]
                              : atual.filter((id) => id !== linha.formId))}
                            className="size-4 accent-[#38bdf8] disabled:opacity-40"
                          />
                          <span className="text-[#cdd7e5]">{linha.nome ?? linha.formId}</span>
                        </label>
                      </td>
                      <td className="cc6-num px-3 py-2.5 text-right font-semibold text-[#e8eef8]">{linha.represadas}</td>
                      <td className="cc6-num px-3 py-2.5 text-right text-[#6b7890]">{linha.jaEntraram}</td>
                      <td className="px-5 py-2.5 text-[11px]">
                        {!linha.registrada ? (
                          <span className="text-[#fda4af]">não registrado — descarta lead nova</span>
                        ) : linha.ativa ? (
                          <span className="text-[#93a2b8]">ativo</span>
                        ) : (
                          <span className="text-[#f2b544]">inativo — descarta lead nova</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {represa.podeLiberar ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-white/5 px-5 py-3">
                <span className="text-[11.5px] text-[#6b7890]">
                  {selecionados.length
                    ? `${selecionados.reduce((soma, id) => soma + (represa.represadas.find((l) => l.formId === id)?.represadas ?? 0), 0)} lead(s) em ${selecionados.length} formulário(s)`
                    : "Selecione os formulários a liberar"}
                </span>
                <div className="ml-auto flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!selecionados.length || liberando}
                    onClick={() => void liberarSelecionados(false)}
                    className="min-h-9 rounded-lg border border-white/10 px-3 text-[11px] font-semibold text-[#cdd7e5] transition hover:border-white/25 disabled:opacity-40"
                  >
                    Liberar sem distribuir
                  </button>
                  <button
                    type="button"
                    disabled={!selecionados.length || liberando}
                    onClick={() => void liberarSelecionados(true)}
                    className="min-h-9 rounded-lg border border-[rgba(125,211,252,0.4)] bg-[rgba(56,189,248,0.12)] px-3 text-[11px] font-semibold text-[#bae6fd] transition hover:bg-[rgba(56,189,248,0.2)] disabled:opacity-40"
                  >
                    {liberando ? "Liberando…" : "Liberar e distribuir"}
                  </button>
                </div>
              </div>
            ) : (
              <p className="border-t border-white/5 px-5 py-3 text-[11.5px] text-[#6b7890]">
                Liberar represa é da diretoria — move verba já gasta para a operação.
              </p>
            )}

            {resultadoDaLiberacao?.map((linha) => (
              <p key={linha} role="status" className="border-t border-white/5 px-5 py-2.5 text-[11.5px] leading-5 text-[#93a2b8]">{linha}</p>
            ))}
          </>
        )}
      </section>

      {/* Formulários da Meta: de onde a lead entra. Fica antes do desempenho
          porque campanha sem formulário registrado não gera lead nenhuma — e o
          erro é silencioso: o webhook recebe e descarta. */}
      <section aria-label="Formulários de lead da Meta" hidden={foraDaEtapa("entrada")} className="cc6-panel cc6-reveal overflow-hidden">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2 px-5 pb-3 pt-4">
          <p className="cc6-eyebrow">Formulários da Meta</p>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void descobrirFormularios(false)}
              disabled={descobrindo}
              className="min-h-9 rounded-lg border border-white/10 px-3 text-[11px] font-semibold text-[#cdd7e5] transition hover:border-white/25 hover:text-white disabled:opacity-50"
            >
              {descobrindo ? "Consultando…" : "Conferir na Meta"}
            </button>
            {formularios && formularios.novos.length > 0 ? (
              <button
                type="button"
                onClick={() => void descobrirFormularios(true)}
                disabled={descobrindo}
                className="min-h-9 rounded-lg border border-[rgba(125,211,252,0.4)] bg-[rgba(56,189,248,0.12)] px-3 text-[11px] font-semibold text-[#bae6fd] transition hover:bg-[rgba(56,189,248,0.2)] disabled:opacity-50"
              >
                Registrar {formularios.novos.length} (inativos)
              </button>
            ) : null}
          </div>
        </div>

        {erroDaDescoberta ? (
          <p role="alert" className="mx-5 mb-4 rounded-xl border border-[rgba(251,113,133,0.32)] bg-[rgba(251,113,133,0.07)] px-4 py-3 text-[12.5px] text-[#fda4af]">
            {erroDaDescoberta}
          </p>
        ) : null}

        {!formularios ? (
          <p className="px-5 pb-4 text-[12px] leading-5 text-[#6b7890]">
            Confere quais formulários existem na Meta e quais o CRM conhece. Formulário não
            registrado entrega lead que o webhook descarta em silêncio.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 px-5 pb-3 text-[11px] text-[#93a2b8]">
              <span className="cc6-chip">{formularios.encontradosNaMeta} na Meta</span>
              <span className="cc6-chip">{formularios.leadsAcumuladosNaMeta} lead(s) acumulada(s) lá</span>
              <span className="cc6-chip">{formularios.jaRegistrados} já no CRM</span>
              {formularios.simulacao ? <span className="cc6-chip">simulação — nada foi gravado</span> : null}
            </div>

            {formularios.fontesOrfas.length ? (
              <div role="alert" className="mx-5 mb-3 rounded-xl border border-[rgba(251,113,133,0.32)] bg-[rgba(251,113,133,0.07)] px-4 py-3">
                <p className="text-[12.5px] font-semibold text-[#fda4af]">
                  {formularios.fontesOrfas.length} fonte(s) apontam para formulário inexistente
                </p>
                <p className="mt-1 text-[12px] leading-5 text-[#93a2b8]">
                  {formularios.fontesOrfas.map((f) => `${f.nome ?? "sem nome"} (${f.formId})`).join(" · ")}
                </p>
                <p className="mt-1 text-[11.5px] leading-5 text-[#6b7890]">
                  O backfill dessas fontes sempre trará zero. Nenhuma foi removida — a decisão é humana.
                </p>
              </div>
            ) : null}

            {formularios.novos.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-[12px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-[.12em] text-[#6b7890]">
                      <th className="px-5 py-2 font-semibold">Formulário fora do CRM</th>
                      <th className="px-5 py-2 text-right font-semibold">Leads na Meta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formularios.novos.slice(0, 10).map((f) => (
                      <tr key={f.formId} className="border-t border-white/5">
                        <td className="px-5 py-2.5 text-[#cdd7e5]">{f.nome ?? f.formId}</td>
                        <td className={`cc6-num px-5 py-2.5 text-right ${f.leads > 0 ? "text-[#e8eef8]" : "text-[#6b7890]"}`}>{f.leads}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {formularios.avisos.map((aviso) => (
              <p key={aviso} className="border-t border-white/5 px-5 py-3 text-[11.5px] leading-5 text-[#93a2b8]">{aviso}</p>
            ))}
          </>
        )}
      </section>

      {/* (0) O que o CRM já sabe sobre a campanha, sem depender da Meta.
           Vem primeiro de propósito: o alerta mais caro desta tela não é de
           mídia, é de atendimento — campanha boa com lead não atendida queima
           verba e ainda ensina o Andromeda a buscar o público errado. */}
      {performance.status === "ok" && performance.data.resumo.leadsAtribuidas > 0 ? (
        <section aria-label="Campanha medida pelo CRM" hidden={foraDaEtapa("desempenho")} className="cc6-panel cc6-reveal overflow-hidden">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pb-3 pt-4">
            <p className="cc6-eyebrow">Campanha medida pelo CRM</p>
            <p className="cc6-num ml-auto text-[11px] text-[#6b7890]">
              {performance.data.resumo.campanhas} campanha(s) · {performance.data.resumo.leadsAtribuidas} lead(s) atribuída(s)
            </p>
          </div>

          {performance.data.alertas.map((alerta) => (
            <div
              key={alerta.titulo}
              role={alerta.nivel === "critico" ? "alert" : "status"}
              className={`mx-5 mb-3 rounded-xl border px-4 py-3 ${
                alerta.nivel === "critico"
                  ? "border-[rgba(251,113,133,0.32)] bg-[rgba(251,113,133,0.07)]"
                  : "border-[rgba(245,181,68,0.28)] bg-[rgba(245,181,68,0.05)]"
              }`}
            >
              <p className={`text-[12.5px] font-semibold ${alerta.nivel === "critico" ? "text-[#fda4af]" : "text-[#f2b544]"}`}>
                {alerta.titulo}
              </p>
              <p className="mt-1 text-[12px] leading-5 text-[#93a2b8]">{alerta.detalhe}</p>
              <p className="mt-1 text-[11.5px] leading-5 text-[#6b7890]">{alerta.acao}</p>
            </div>
          ))}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[12px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-[.12em] text-[#6b7890]">
                  <th className="px-5 py-2 font-semibold">Campanha · anúncio</th>
                  <th className="px-3 py-2 text-right font-semibold">Leads</th>
                  <th className="px-3 py-2 text-right font-semibold">Contatadas</th>
                  <th className="px-3 py-2 text-right font-semibold">Avançaram</th>
                  <th className="px-5 py-2 text-right font-semibold">CPL</th>
                </tr>
              </thead>
              <tbody>
                {performance.data.linhas.slice(0, 8).map((linha) => (
                  <tr key={`${linha.campanha}-${linha.anuncio}-${linha.canal}`} className="border-t border-white/5">
                    <td className="px-5 py-2.5">
                      <span className="cc6-num text-[#cdd7e5]">{linha.campanha}</span>
                      <span className="ml-2 text-[11px] text-[#6b7890]">{linha.canal ?? "—"}</span>
                    </td>
                    <td className="cc6-num px-3 py-2.5 text-right text-[#cdd7e5]">{linha.leads}</td>
                    <td className={`cc6-num px-3 py-2.5 text-right ${linha.contatados === 0 ? "text-[#fda4af]" : "text-[#cdd7e5]"}`}>
                      {linha.contatados}
                      {linha.taxaContato !== null ? (
                        <span className="ml-1 text-[10px] text-[#6b7890]">{Math.round(linha.taxaContato * 100)}%</span>
                      ) : null}
                    </td>
                    <td className="cc6-num px-3 py-2.5 text-right text-[#cdd7e5]">{linha.avancaram}</td>
                    {/* Sem a API de anúncios não há CPL. Traço, nunca R$ 0,00. */}
                    <td className="cc6-num px-5 py-2.5 text-right text-[#6b7890]">
                      {linha.cpl === null ? "—" : linha.cpl.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!performance.data.metricasDeMidia.disponivel ? (
            <p className="border-t border-white/5 px-5 py-3 text-[11.5px] leading-5 text-[#6b7890]">
              {performance.data.metricasDeMidia.motivo} <span className="text-[#93a2b8]">{performance.data.metricasDeMidia.proximaAcao}</span>
            </p>
          ) : null}
        </section>
      ) : null}

      {report ? (
        <>
          {/* (a) Faixa de 4 números. */}
          <section aria-label="Números da semana" hidden={foraDaEtapa("desempenho")} className="cc6-panel cc6-reveal grid grid-cols-2 gap-y-4 px-5 py-4 sm:grid-cols-4">
            {strip.map((item) => (
              <div key={item.label}>
                <p className="cc6-metric-value text-2xl leading-none sm:text-[26px]">{item.value}</p>
                <p className="cc6-metric-label mt-1.5">{item.label}</p>
              </div>
            ))}
          </section>

          {/* (b) Coração da tela: decisões do plano da IA. */}
          <section aria-label="Decisões da IA" hidden={foraDaEtapa("agir")} className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "60ms" }}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pb-3 pt-4">
              <p className="cc6-eyebrow">Decisões da IA</p>
              <p className="cc6-num ml-auto text-[11px] text-[#6b7890]">
                desperdício {money.format(report.plan.summary.desperdicioSemanal)}/sem · economia {money.format(report.plan.summary.economiaPotencial)} ·{" "}
                <span className="cc6-ok">{report.plan.summary.produtosEficientes} eficientes</span> ·{" "}
                <span className="cc6-crit">{report.plan.summary.produtosCaros} caros</span>
              </p>
            </div>
            {moves.length === 0 ? (
              <p className="cc6-hairline px-5 py-5 text-sm text-[#6b7890]">Nenhum movimento recomendado nesta janela.</p>
            ) : (
              moves.map((move, index) => {
                const proj = report.projection?.projections.find((p) => p.moveKind === move.kind && p.target === move.target);
                const dl = proj?.weeklyLeadsDelta;
                return (
                <div key={`${move.kind}-${move.target}-${index}`} className="cc6-hairline flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-2.5">
                  <span className={`cc6-chip ${MOVE_META[move.kind].ink}`}>{MOVE_META[move.kind].label}</span>
                  <span className="text-sm font-medium text-[#e8eef8]">{move.target}</span>
                  <span className="cc6-num text-[10px] uppercase tracking-[.1em] text-[#6b7890]">{move.scope}</span>
                  {typeof move.amount === "number" ? <span className="cc6-num text-[11px] text-[#aab6ca]">{money.format(move.amount)}</span> : null}
                  {dl && (dl.esperado !== 0 || dl.otimista !== 0 || dl.pessimista !== 0) ? (
                    <span className={`cc6-chip cc6-num ${dl.esperado >= 0 ? "cc6-ok" : "cc6-crit"}`} title={`Projeção · confiança ${proj?.confidence}`}>
                      {dl.esperado >= 0 ? "▲" : "▼"} {dl.pessimista > 0 ? "+" : ""}{dl.pessimista} a {dl.otimista > 0 ? "+" : ""}{dl.otimista} leads/sem
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 basis-full text-[13px] leading-5 text-[#aab6ca] sm:basis-auto">{move.reason}</span>
                  {/* Premissas visíveis: a faixa acima é derivada delas. Número
                      sem lastro à vista é o que faz o gestor desconfiar da IA. */}
                  {proj?.assumptions?.length ? (
                    <span className="basis-full text-[11px] leading-4 text-[#6b7890]">{proj.assumptions.join(" · ")}</span>
                  ) : null}
                </div>
                );
              })
            )}
          </section>

          {/* (c) Agregado por dimensão com barra de share inline. */}
          <section aria-label="Custos por dimensão" hidden={foraDaEtapa("desempenho")} className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "120ms" }}>
            <div className="flex flex-wrap items-center gap-2 px-5 pb-3 pt-4">
              <p className="cc6-eyebrow">Custo → CRM</p>
              <div role="tablist" aria-label="Dimensão do agregado" className="ml-auto flex gap-1.5">
                {DIMS.map((item) => (
                  <button
                    key={item.id}
                    role="tab"
                    aria-selected={dim === item.id}
                    onClick={() => setDim(item.id)}
                    className={`cc6-chip transition-colors ${dim === item.id ? "border-[rgba(75,141,248,.4)]! text-[var(--atlas-accent)]" : "hover:text-[#e8eef8]"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="cc6-hairline border-t-0! font-mono text-[10px] uppercase tracking-[.14em] text-[#6b7890]">
                    <th scope="col" className="px-5 py-2.5 font-semibold">Nome</th>
                    <th scope="col" className="py-2.5 pr-4 text-right font-semibold">Invest.</th>
                    <th scope="col" className="py-2.5 pr-4 text-right font-semibold">Leads</th>
                    <th scope="col" className="py-2.5 pr-4 text-right font-semibold">Vendas</th>
                    <th scope="col" className="py-2.5 pr-4 text-right font-semibold">CPL</th>
                    <th scope="col" className="py-2.5 pr-4 text-right font-semibold">CAC</th>
                    <th scope="col" className="py-2.5 pr-5 text-right font-semibold">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={7} className="cc6-hairline px-5 py-5 text-[#6b7890]">Sem investimento atribuído nesta dimensão.</td></tr>
                  ) : (
                    rows.map((row) => {
                      const broken = attributionOf(row.key);
                      const note = broken ? attributionNote(broken.leadsUnlinked) : undefined;
                      return (
                      <tr key={row.key} className="cc6-hairline transition-colors hover:bg-white/[.02]">
                        <td className="max-w-56 truncate px-5 py-2.5 font-medium text-[#e8eef8]" title={row.label}>{row.label}</td>
                        <td className="cc6-num py-2.5 pr-4 text-right text-[#e8eef8]">{money.format(row.spend)}</td>
                        <td className="cc6-num py-2.5 pr-4 text-right text-[#aab6ca]" title={note}>
                          {row.leads}
                          {broken ? <span className="ml-1 text-[10px] text-[#f5b544]">+?</span> : null}
                        </td>
                        <td className="cc6-num py-2.5 pr-4 text-right text-[#aab6ca]" title={note}>{broken ? "—" : row.sales}</td>
                        <td className="cc6-num py-2.5 pr-4 text-right text-[#aab6ca]" title={note}>{broken ? "—" : row.cpl !== null ? money.format(row.cpl) : "—"}</td>
                        <td className="cc6-num py-2.5 pr-4 text-right text-[#aab6ca]" title={note}>{broken ? "—" : row.cac !== null ? money.format(row.cac) : "—"}</td>
                        <td className="py-2.5 pr-5">
                          <span className="flex items-center justify-end gap-2">
                            <span aria-hidden="true" className="block h-[3px] w-14 overflow-hidden rounded-full bg-white/[.06]">
                              <span className="block h-full rounded-full bg-[var(--atlas-accent)] opacity-80" style={{ width: `${Math.min(100, Math.max(0, row.share))}%` }} />
                            </span>
                            <span className="cc6-num text-[11px] text-[#6b7890]">{row.share.toFixed(0)}%</span>
                          </span>
                        </td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {dim === "byCampaign" && rows.some((row) => attributionOf(row.key)) ? (
              <p className="cc6-hairline px-5 py-2.5 text-[11px] leading-5 text-[#6b7890]">
                “—” com “+?” ao lado dos leads: a campanha tem leads sem elo de atribuição (ou o elo não é
                mensurável neste banco). Venda, CPL e CAC ficam ocultos de propósito — ali o zero seria
                ausência de medição, não resultado.
              </p>
            ) : null}
          </section>

          {/* (d) Verba por produto com pacing como banda de severidade. */}
          <section aria-label="Verba semanal" hidden={foraDaEtapa("desempenho")} className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "180ms" }}>
            <p className="cc6-eyebrow px-5 pb-3 pt-4">Verba semanal</p>
            {report.budget.length === 0 ? (
              <p className="cc6-hairline px-5 py-5 text-sm text-[#6b7890]">Nenhuma verba semanal definida — use as decisões acima para definir metas.</p>
            ) : (
              report.budget.map((row) => (
                <div
                  key={`${row.product}-${row.developer}`}
                  className="cc6-hairline cc6-sev-band flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 pl-5 pr-5"
                  style={{ "--cc6-sev": PACING_META[row.pacing].sev } as CSSProperties}
                >
                  <span className="text-sm font-medium text-[#e8eef8]">{row.product}</span>
                  <span className="cc6-num text-[10px] uppercase tracking-[.1em] text-[#6b7890]">{row.developer}</span>
                  <span className="cc6-num text-[11px] text-[#aab6ca]">
                    {money.format(row.spent)} de {money.format(row.weeklyBudget)} · {row.pctUsed.toFixed(0)}% · {PACING_META[row.pacing].label}
                  </span>
                  <span className={`cc6-num text-[11px] ${VERDICT_INK[row.verdict]}`}>
                    {row.verdict === "sem_dados" ? "sem dados" : row.verdict}
                    {row.cac !== null ? ` · CAC ${money.format(row.cac)}` : ""}
                    {row.targetCac !== null ? ` / meta ${money.format(row.targetCac)}` : ""}
                  </span>
                  <span className="min-w-0 flex-1 basis-full text-[12px] leading-5 text-[#6b7890] sm:basis-auto sm:text-right">{row.recommendation}</span>
                </div>
              ))
            )}
          </section>
        </>
      ) : null}

      {/* (e) Andromeda — saúde criativa; degrada em silêncio se ainda não existe. */}
      {andromeda.status === "ok" ? (
        <section aria-label="Saúde criativa Andromeda" hidden={foraDaEtapa("criativo")} className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "240ms" }}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pb-3 pt-4">
            <p className="cc6-eyebrow">Andromeda · Saúde criativa</p>
            {andromeda.data.forecast ? (() => {
              const f = andromeda.data.forecast.account;
              const p = f.projectedWeeklyLeads;
              const leads = p.pessimista === p.otimista ? `${p.esperado} leads` : `${p.pessimista}–${p.otimista} leads`;
              const conf = f.confidence === "media" ? "média" : f.confidence;
              const cpl = f.projectedCpl != null ? ` · CPL ~R$ ${f.projectedCpl}` : "";
              return (
                <span className={`cc6-chip ${f.pace === "desacelerando" ? "cc6-crit" : f.pace === "acelerando" ? "cc6-ok" : ""}`}
                  title={f.assumptions.length ? f.assumptions.join(" · ") : "Trajetória projetada da conta"}>
                  {f.pace === "desacelerando" ? "📉" : f.pace === "acelerando" ? "📈" : "➡️"} conta {f.pace} · {leads}/sem · conf. {conf}{cpl}
                </span>
              );
            })() : null}
            <span className={`cc6-chip ml-auto ${andromeda.data.consolidation.verdict === "fragmentada" ? "cc6-warn" : "cc6-ok"}`} title={andromeda.data.consolidation.reason}>
              conta {andromeda.data.consolidation.verdict}
            </span>
          </div>
          {andromeda.data.forecast?.anomalies?.length ? (
            <p className="cc6-hairline px-5 py-2.5 text-[12px] leading-5 text-[#f2b544]">🔮 {andromeda.data.forecast.anomalies.join(" · ")}</p>
          ) : null}
          {andromeda.data.rotations?.proposals?.length ? (
            <div className="cc6-hairline px-5 py-2.5">
              <p className="text-[12px] leading-5 text-[#9db2d0]">🔄 {andromeda.data.rotations.summary}</p>
              {andromeda.data.rotations.proposals.slice(0, 4).map((rot, index) => (
                <div
                  key={`${rot.campaignName}-${rot.pauseAd?.adId ?? index}`}
                  /* cc23-quiet separa por fundo em vez de desenhar mais uma borda
                     dentro do painel (caixa dentro de caixa); o tracejado da
                     costura diz, sem legenda, que isto ainda é proposta. */
                  className="cc23-quiet cc23-seam cc23-draft mt-2.5"
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="cc6-chip cc6-crit">pausar</span>
                    <span className="min-w-0 truncate text-[12.5px] text-[#e8eef8]">{rot.pauseAd?.adName ?? "anúncio fatigado"}</span>
                    <span className="cc6-num text-[10px] uppercase tracking-[.1em] text-[#6b7890]">{rot.campaignName}</span>
                  </div>
                  {/* Sinais de fadiga eram tooltip — invisíveis no toque e no leitor
                      de tela. São o lastro do "pausar": ficam na linha. */}
                  {rot.pauseAd?.signals?.length ? (
                    <p className="cc6-num mt-1 text-[11px] leading-5 text-[#f2b544]">{rot.pauseAd.signals.join(" · ")}</p>
                  ) : null}
                  <p className="mt-1 text-[11.5px] leading-5 text-[#6b7890]">{rot.reason}</p>
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="cc6-chip cc6-ok">substituir por</span>
                    <span className="cc6-num text-[11px] text-[#aab6ca]">ângulo {rot.replacement.angle}</span>
                  </div>
                  {rot.replacement.copy ? (
                    <div className="mt-1.5 space-y-1">
                      <p className="text-[12.5px] leading-5 text-[#c3ccdb]">{rot.replacement.copy.primaryText}</p>
                      <p className="text-[11.5px] leading-5 text-[#8b97ab]">
                        <b className="text-[#aab6ca]">{rot.replacement.copy.headline}</b>
                        {rot.replacement.copy.description ? ` · ${rot.replacement.copy.description}` : ""}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1.5 text-[11.5px] leading-5 text-[#6b7890]">Substituto sem copy redigido — a peça precisa de brief do produto para ser proposta.</p>
                  )}
                  <p className="cc6-num mt-2 text-[10px] uppercase tracking-[.1em] text-[#6b7890]">proposta · nada é pausado ou publicado automaticamente</p>
                </div>
              ))}
              {andromeda.data.rotations.proposals.length > 4 ? (
                <p className="cc6-num mt-2 text-[11px] text-[#6b7890]">+{andromeda.data.rotations.proposals.length - 4} rotações propostas</p>
              ) : null}
            </div>
          ) : null}
          {andromeda.data.health.map((item) => (
            <div key={item.campaignId} className="cc6-hairline flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
              <p className={`cc6-metric-value w-14 text-3xl leading-none ${item.andromedaScore < 50 ? "cc6-crit" : item.andromedaScore < 70 ? "cc6-warn" : "cc6-ok"}`}>
                {Math.round(item.andromedaScore)}
              </p>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#e8eef8]">{item.campaignName}</p>
                <p className="cc6-num mt-0.5 text-[11px] text-[#6b7890]">{item.activeAds} anúncios ativos · diversidade {Math.round(item.diversityScore)}</p>
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-1.5">
                {item.fatigue.slice(0, 3).map((signal) => (
                  <span key={signal.adId + signal.kind} className="cc6-chip cc6-warn" title={signal.detail}>{signal.adName} · {signal.kind}</span>
                ))}
                {item.fatigue.length > 3 ? <span className="cc6-chip">+{item.fatigue.length - 3}</span> : null}
                {item.fatigue.length === 0 ? <span className="cc6-chip cc6-ok">sem fadiga</span> : null}
              </div>
            </div>
          ))}
        </section>
      ) : andromeda.status === "waiting" ? (
        <p className="cc6-panel-quiet cc6-reveal p-4 text-sm leading-6 text-[#6b7890]">Andromeda · saúde criativa aguardando ativação.</p>
      ) : andromeda.status === "error" ? (
        <AtlasRecoverableError description={andromeda.message} onRetry={retry} scope="module" />
      ) : null}

      {/* Análise preditiva — a série semanal REAL (linha) + a projeção (tracejado).
          Antes a previsão só existia como texto num chip; a série era descartada. */}
      {(() => {
        if (andromeda.status !== "ok") return null;
        const f = andromeda.data.forecast;
        if (!f?.weeks || f.weeks.length < 2) return null;
        const hist = f.weeks;
        const p = f.account.projectedWeeklyLeads;
        const vals = [...hist.map((x) => x.leads), p.esperado];
        const max = Math.max(...vals, 1);
        const W = 620, H = 112, pad = 10;
        const stepX = (W - pad * 2) / Math.max(1, vals.length - 1);
        const yOf = (v: number) => H - pad - (v / max) * (H - pad * 2);
        const pts = hist.map((x, i) => ({ x: pad + i * stepX, y: yOf(x.leads) }));
        const line = pts.map((q, i) => `${i ? "L" : "M"}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ");
        const lastPt = pts[pts.length - 1];
        const projPt = { x: pad + (vals.length - 1) * stepX, y: yOf(p.esperado) };
        const conf = f.account.confidence === "media" ? "média" : f.account.confidence;
        const accent = "var(--atlas-accent, #4b8df8)";
        return (
          <section aria-label="Análise preditiva" hidden={foraDaEtapa("criativo")} className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "260ms" }}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pb-3 pt-4">
              <p className="cc6-eyebrow">Análise preditiva · conta</p>
              <span className="text-[11px] leading-5 text-[#6b7890]">histórico real (linha) + projeção (tracejado) · confiança {conf}</span>
            </div>
            <div className="px-5 pb-2">
              <svg viewBox={`0 0 ${W} ${H}`} className="h-[112px] w-full" role="img" aria-label={`Leads por semana em ${hist.length} semanas; projeção de ${p.pessimista} a ${p.otimista} na próxima`}>
                <path d={line} fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                <path d={`M${lastPt.x.toFixed(1)},${lastPt.y.toFixed(1)} L${projPt.x.toFixed(1)},${projPt.y.toFixed(1)}`} fill="none" stroke={accent} strokeWidth="2" strokeDasharray="5 4" opacity="0.7" />
                {pts.map((q, i) => <circle key={i} cx={q.x} cy={q.y} r="2.5" fill={accent} />)}
                <circle cx={projPt.x} cy={projPt.y} r="3.5" fill="none" stroke={accent} strokeWidth="2" />
              </svg>
            </div>
            <div className="cc6-hairline grid gap-4 px-5 py-3 sm:grid-cols-3">
              <div><p className="cc6-metric-label">Leads próx. semana</p><p className="cc6-metric-value mt-1 text-lg">{p.pessimista === p.otimista ? p.esperado : `${p.pessimista}–${p.otimista}`}</p></div>
              <div><p className="cc6-metric-label">CPL projetado</p><p className="cc6-metric-value mt-1 text-lg">{f.account.projectedCpl == null ? "—" : money.format(f.account.projectedCpl)}</p></div>
              <div><p className="cc6-metric-label">Semanas medidas</p><p className="cc6-metric-value mt-1 text-lg">{hist.length}</p></div>
            </div>
            {f.account.assumptions.length ? (
              <p className="cc6-hairline px-5 py-2.5 text-[11px] leading-4 text-[#6b7890]">{f.account.assumptions.join(" · ")}</p>
            ) : null}
          </section>
        );
      })()}

      {/* Localizador de público — o motor (audience-finder) já vinha na rota e a tela
          descartava. Demografia é OBSERVAÇÃO da entrega; segmentar por ela é proibido
          sob HOUSING — por isso o policyNote aparece junto. */}
      {(() => {
        if (andromeda.status !== "ok") return null;
        const a = andromeda.data.audience;
        if (!a) return null;
        const chip = (v: string) => (v === "escalar" || v === "manter" || v === "focado" ? "cc6-ok" : v === "descartar" || v === "vazando" ? "cc6-crit" : "cc6-warn");
        const cpl = (v: number | null | undefined) => (v == null ? "—" : money.format(v));
        return (
          <section aria-label="Inteligência de público" hidden={foraDaEtapa("criativo")} className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "280ms" }}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pb-3 pt-4">
              <p className="cc6-eyebrow">Localizador de público</p>
              <span className="text-[11px] leading-5 text-[#6b7890]">onde responde · onde vaza · quem responde</span>
            </div>
            <div className="cc6-hairline grid gap-5 px-5 py-4 sm:grid-cols-3">
              <div>
                <p className="cc6-metric-label mb-2">Onde responde</p>
                {a.placements.length ? a.placements.slice(0, 4).map((p, i) => (
                  <div key={`${p.platform}-${p.position}-${i}`} className="mb-2 flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-[12.5px] text-[#c3ccdb]">{p.platform}{p.position ? ` · ${p.position}` : ""}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="cc6-num text-[12px] text-[#8b97ab]">{cpl(p.cpl)}</span>
                      <span className={`cc6-chip ${chip(p.verdict)}`} title={p.reason}>{p.verdict}</span>
                    </span>
                  </div>
                )) : <p className="text-[12px] leading-5 text-[#6b7890]">Sem dados de posicionamento ainda.</p>}
              </div>
              <div>
                <p className="cc6-metric-label mb-2">Onde vaza</p>
                {a.geo ? (
                  <>
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <span className="text-[12.5px] text-[#c3ccdb]">Fora da praça</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="cc6-num text-[12px] text-[#8b97ab]">{a.geo.leak.sharePct}%</span>
                        <span className={`cc6-chip ${chip(a.geo.verdict)}`}>{a.geo.verdict}</span>
                      </span>
                    </div>
                    {a.geo.leak.topRegions.slice(0, 3).map((r) => (
                      <p key={r.region} className="text-[12px] leading-5 text-[#6b7890]">{r.region} · {r.leads} leads</p>
                    ))}
                  </>
                ) : <p className="text-[12px] leading-5 text-[#6b7890]">Sem quebra geográfica disponível.</p>}
              </div>
              <div>
                <p className="cc6-metric-label mb-2">Quem responde</p>
                {a.demo && a.demo.lines.length ? (
                  <>
                    {a.demo.lines.slice(0, 3).map((d, i) => (
                      <div key={`${d.age}-${d.gender}-${i}`} className="mb-2 flex items-baseline justify-between gap-2">
                        <span className="text-[12.5px] text-[#c3ccdb]">{d.age} · {d.gender}</span>
                        <span className="cc6-num shrink-0 text-[12px] text-[#8b97ab]">{cpl(d.cpl)}</span>
                      </div>
                    ))}
                    <p className="mt-2 text-[11px] leading-4 text-[#6b7890]">{a.demo.policyNote}</p>
                  </>
                ) : <p className="text-[12px] leading-5 text-[#6b7890]">Sem quebra demográfica disponível.</p>}
              </div>
            </div>
            {/* Qual MENSAGEM responde: CPL por ângulo criativo. Só anúncios na
                convenção [Atlas] entram — os demais não têm ângulo legível e
                por isso a lista pode vir vazia (ausência explicada). */}
            <div className="cc6-hairline px-5 py-4">
              <p className="cc6-metric-label mb-2">Qual mensagem responde · CPL por ângulo</p>
              {a.angles?.length ? (
                <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {a.angles.slice(0, 6).map((line) => (
                    <div key={`${line.product}-${line.angle}`} className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-[12.5px] text-[#c3ccdb]">{line.angle}<span className="text-[#6b7890]"> · {line.product}</span></span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="cc6-num text-[12px] text-[#8b97ab]">{cpl(line.cpl)}</span>
                        <span className="cc6-num text-[11px] text-[#6b7890]">{line.leads} leads · {line.ads} peças</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] leading-5 text-[#6b7890]">
                  Sem ângulo legível nos anúncios da janela — o CPL por ângulo só existe para peças nomeadas na convenção do Atlas.
                </p>
              )}
            </div>
          </section>
        );
      })()}

      {/* Prescrições governadas — verdicts viram propostas reversíveis (policy-engine).
          A rota já mandava evidence / expectedEffect / confidence / targetId e a tela
          renderizava só o rótulo: o diretor via O QUE fazer sem o número que sustenta,
          sem o efeito esperado e sem o anúncio alvo — decisão no escuro. Cada linha
          leva a costura tracejada (cc23-draft): é proposta, não fato consumado. */}
      {(() => {
        if (andromeda.status !== "ok") return null;
        const pres = andromeda.data.prescriptions;
        if (!pres || !pres.proposals.length) return null;
        const shown = pres.proposals.slice(0, 6);
        return (
          <section aria-label="Prescrições da IA" hidden={foraDaEtapa("agir")} className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "300ms" }}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pb-3 pt-4">
              <p className="cc6-eyebrow">Prescrições · a IA propõe, você aprova</p>
              <span className="text-[11px] leading-5 text-[#6b7890]">{pres.summary}</span>
            </div>
            <div className="cc23-rows cc6-hairline px-5 py-2">
              {shown.map((p, i) => {
                const meta = PRESCRIPTION_META[p.kind] ?? { label: p.kind.replace(/_/g, " "), ink: "" };
                // A rota manda `rationale`; `reason` é o mesmo texto sob outro nome.
                const why = p.rationale ?? p.reason ?? "";
                const lastro = p.evidence ?? "";
                const targetId = p.targetId ?? "";
                return (
                  <div key={`${p.kind}-${p.target}-${i}`} className="cc23-row cc23-seam cc23-draft flex-wrap">
                    <span className={`cc6-chip ${meta.ink}`}>{meta.label}</span>
                    <span className="min-w-0 truncate text-[13px] font-medium text-[#e8eef8]">{p.target}</span>
                    {targetId ? (
                      <button
                        type="button"
                        onClick={() => { void copyTargetId(targetId); }}
                        title="Copiar o id do anúncio para agir na plataforma — este botão não pausa nada"
                        className="cc6-chip cc6-num transition-colors hover:border-[rgba(75,141,248,.4)] hover:text-[var(--atlas-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
                      >
                        {copiedTargetId === targetId ? "id copiado" : `id ${targetId}`}
                      </button>
                    ) : null}
                    {p.confidence ? (
                      <span className={`cc6-chip cc6-num ${p.confidence === "alta" ? "cc6-ok" : ""}`}>
                        confiança {p.confidence === "media" ? "média" : p.confidence}
                      </span>
                    ) : null}
                    {p.reversible ? <span className="cc6-chip">reversível</span> : null}
                    {/* O lastro primeiro: é do número medido que a decisão vive.
                        Um bloco só, para o texto não virar três linhas soltas. */}
                    <div className="basis-full space-y-1">
                      {lastro ? <p className="text-[12.5px] leading-5 text-[#c3ccdb]">{lastro}</p> : null}
                      {p.expectedEffect ? (
                        <p className="text-[12px] leading-5 text-[#8b97ab]">Efeito esperado: {p.expectedEffect}</p>
                      ) : null}
                      {why ? <p className="text-[11.5px] leading-5 text-[#6b7890]">{why}</p> : null}
                      {!lastro && !p.expectedEffect ? (
                        <p className="text-[11.5px] leading-5 text-[#6b7890]">
                          Esta prescrição chegou sem número de lastro nem efeito esperado — trate como sinal a investigar, não como recomendação.
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            {pres.proposals.length > shown.length ? (
              <p className="cc6-num px-5 pt-2 text-[11px] text-[#6b7890]">+{pres.proposals.length - shown.length} prescrições nesta janela</p>
            ) : null}
            <p className="cc6-num px-5 pb-4 pt-2 text-[10px] uppercase tracking-[.1em] text-[#6b7890]">
              proposta · nada é pausado, consolidado ou publicado automaticamente
            </p>
          </section>
        );
      })()}

      {/* Transparência: como as IAs decidem — linha discreta expansível. */}
      {calibration.status === "ok" && calibration.data.summary.length > 0 ? (
        <details className="cc6-panel-quiet cc6-reveal px-4 py-3">
          <summary className="cc6-eyebrow cursor-pointer list-none select-none">como as IAs decidem ▸</summary>
          <ul className="mt-2 space-y-1">
            {calibration.data.summary.map((line) => (
              <li key={line} className="text-[13px] leading-5 text-[#aab6ca]">{line}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {/* (f) Satélites em uma linha discreta. */}
      <nav aria-label="Módulos satélites" hidden={foraDaEtapa("agir")} className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="cc6-eyebrow mr-1.5">Módulos</span>
        {SATELLITES.map((satellite) => (
          <Link
            key={satellite.href}
            href={satellite.href}
            className="cc6-chip transition-colors hover:border-[rgba(75,141,248,.4)] hover:text-[var(--atlas-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
          >
            {satellite.label} →
          </Link>
        ))}
      </nav>
    </div>
  );
}
