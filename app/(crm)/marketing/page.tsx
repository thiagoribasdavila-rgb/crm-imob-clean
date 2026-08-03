"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/atlas/page-header";
import { AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { CreativeFunnelPanel } from "@/components/marketing/creative-funnel-panel";
import { CampaignIntakePanel } from "@/components/marketing/campaign-intake-panel";
import { reconciliaInvestimento } from "@/lib/marketing/reconciliacao-de-investimento";
import { validarPageId, validarFormId } from "@/lib/meta/identificadores";

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
  abaixo: { label: "abaixo do ritmo", sev: "var(--atlas-texto-fraco)" },
  no_ritmo: { label: "no ritmo", sev: "var(--atlas-estado-sucesso)" },
  estourando: { label: "estourando", sev: "var(--atlas-estado-atencao)" },
  estourou: { label: "estourou", sev: "var(--atlas-estado-perigo)" },
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
        <p className="mt-1.5 text-corpo leading-6 text-[var(--atlas-texto-medio)]">
          Este painel consolida investimento e decisões de verba — acesso restrito a gestores.
        </p>
      </div>
    );
  if (state.status === "waiting")
    return <p className="cc6-panel-quiet p-4 text-corpo leading-6 text-[var(--atlas-texto-fraco)]">{waiting}</p>;
  if (state.status === "error")
    return <AtlasRecoverableError description={state.message} onRetry={onRetry} scope="module" />;
  return null;
}

type SaudeDaEntrada = {
  estado: "sem_configuracao" | "em_dia" | "atrasado" | "mudo" | "nunca_recebeu";
  resumo: string;
  exigeAcao: boolean;
  horasSemEvento: number | null;
  ultimoEventoEm: string | null;
  leadMaisNovaEm: string | null;
  volume: { ultimas24h: number; ultimos7dias: number; ultimos30dias: number; total: number };
  importados: number;
  importadosSemLead: number;
  semDestino: number;
  erros: Array<{ causa: string; quantidade: number; esperado: boolean }>;
  errosInesperados: number;
  fontes: { ativas: number; registradas: number };
  pagina: { pageId: string | null; ambigua: boolean };
};

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
  const [saudeDaEntrada, setSaudeDaEntrada] = useState<SaudeDaEntrada | null>(null);
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
      const fila = r.ok ? (corpo.data as FilaDeRepresadas) : null;
      if (fila) setRepresa(fila);

      // A saúde recebe a represa MEDIDA na Meta. Sem ela, a rota cairia na fila
      // sem destino como substituto — honesto, mas menor: lead que a Meta tem e
      // nunca bateu à porta não aparece lá. Passar o número aqui é o que separa
      // "nada esperando" de "nada que eu tenha visto".
      const rs = await fetch(
        `/api/v1/integrations/meta/saude${fila ? `?represa=${Number(fila.totalRepresado ?? 0)}` : ""}`,
        { headers: { Authorization: `Bearer ${sessao.session?.access_token || ""}` } },
      );
      const cs = await rs.json();
      if (rs.ok) setSaudeDaEntrada(cs.data as SaudeDaEntrada);
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
  /* Os campos da tela “Conectar Página/Formulário”. `todosOsFormularios` nasce
     VERDADEIRO: uma Página com vários formulários ativos e uma origem presa a
     um deles perde as leads dos outros em silêncio — elas chegam, não casam a
     fonte e vão parar em meta_leads_sem_destino esperando alguém notar. */
  const [paginaMeta, setPaginaMeta] = useState("");
  const [formularioMeta, setFormularioMeta] = useState("");
  const [nomeDaOrigem, setNomeDaOrigem] = useState("");
  const [todosOsFormularios, setTodosOsFormularios] = useState(true);

  async function descobrirFormularios(aplicar: boolean) {
    /**
     * ── O CONTRATO QUE FALTAVA ────────────────────────────────────────────
     *
     * Esta função mandava apenas `{ aplicar }`. A rota, sem `pageId`, caía em
     * `META_PAGE_ID` — que NÃO existe no ambiente do servidor (medido: só o
     * .env.local desta máquina tem). Resultado em produção: 400
     * META_PAGE_AUSENTE, sempre, e o campo de Página na tela era decorativo.
     *
     * A validação acontece AQUI antes de sair, e de novo no servidor. Não é
     * redundância: a tela recusa para dar resposta imediata a quem digitou; o
     * servidor recusa porque não pode confiar em quem chama. As duas leem a
     * MESMA regra de lib/meta/identificadores.ts — duas cópias divergiriam.
     */
    const veredito = validarPageId(paginaMeta);
    if (!veredito.ok) {
      setErroDaDescoberta(veredito.mensagem);
      return; // os valores digitados ficam na tela — refazer o preenchimento pune quem errou uma vez
    }
    const vereditoDoFormulario = validarFormId(formularioMeta, todosOsFormularios);
    if (!vereditoDoFormulario.ok) {
      setErroDaDescoberta(vereditoDoFormulario.mensagem);
      return;
    }

    setDescobrindo(true);
    setErroDaDescoberta(null);
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const resposta = await fetch("/api/v1/integrations/meta/discover-forms", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessao.session?.access_token || ""}` },
        body: JSON.stringify({
          pageId: veredito.valor,
          // `null` e não string vazia: o banco distingue "sem formulário" de
          // "formulário chamado string vazia", e a coluna é nullable de propósito.
          formId: todosOsFormularios ? null : vereditoDoFormulario.valor,
          sourceName: nomeDaOrigem.trim() || null,
          allForms: todosOsFormularios,
          aplicar,
        }),
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
  /**
   * PROPOSTA PARADA É DECISÃO — e decisão sobe.
   *
   * As abas "Criativo" e "Agir" traziam o contador CRAVADO EM 0. A pastilha
   * existia, o CSS dela existia, e os números que ela deveria mostrar já
   * estavam carregados na página: o diretor via "Agir" muda enquanto N
   * movimentos e M prescrições esperavam aprovação, e só descobria clicando.
   *
   * Nada é inventado: são exatamente as listas que as seções abaixo
   * renderizam. Quando a Andromeda não respondeu, `dadosAndromeda` é null e o
   * contador não aparece — ausência não vira zero.
   */
  const dadosAndromeda = andromeda.status === "ok" ? andromeda.data : null;
  const rotacoesPropostas = dadosAndromeda?.rotations?.proposals.length ?? 0;
  const prescricoesPropostas = dadosAndromeda?.prescriptions?.proposals.length ?? 0;
  const movimentosPropostos = report ? report.plan.moves.length : 0;
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

  /**
   * ═══ O CPL QUE DIVIDIA O DINHEIRO DE UMA CONTA PELAS LEADS DE OUTRA ═══════
   *
   * Medido nesta organização em 02/08/2026, direto de /api/v1/marketing/cost-report:
   *
   *   7 campanhas com gasto ..... R$ 4.122,19 ..... leads: 0 em TODAS
   *   1 campanha com leads ...... 24 leads ........ spend: 0
   *
   * Nenhuma linha do relatório tem as duas pontas. A conta que gastou não é a
   * que produziu as leads (a das 24 é `120251113236400624`, fora da conta de
   * anúncios que o CRM lê). E a tela estampava, no terceiro degrau da faixa:
   *
   *   CPL médio ......... R$ 172
   *
   * que é 4.122,19 ÷ 24 — redondo, apresentável em reunião, e falso. É verba de
   * um lugar dividida por resultado de outro, e é justamente o número pelo qual
   * o diretor decide escalar ou pausar.
   *
   * `lib/marketing/reconciliacao-de-investimento.ts` já existia com esta regra
   * escrita e testada — CPL só onde as duas pontas são a MESMA campanha — e a
   * tela não a consultava. Passa a consultar: quando existe campanha com gasto
   * E lead, o número aparece (média ponderada só sobre essas); quando não
   * existe, o degrau mostra "—" e a frase abaixo diz por quê. Ausência com
   * motivo é diagnóstico; número inventado vira decisão de verba.
   *
   * O que NÃO muda: "Investimento", "Leads" e "Campanhas" continuam sendo os
   * mesmos fatos observados, na mesma posição.
   */
  const reconciliacao = useMemo(() => {
    if (!report) return null;
    const linhas = report.byCampaign.aggregate;
    return reconciliaInvestimento(
      linhas
        .filter((row) => row.spend > 0)
        .map((row) => ({ externalId: row.key, nome: row.label, reais: row.spend, de: null, ate: null })),
      linhas.filter((row) => row.leads > 0).map((row) => ({ externalId: row.key, leads: row.leads })),
    );
  }, [report]);

  // O único número que decide nesta tela é o investimento — é a pergunta que o
  // diretor traz. Ele carrega a escala de herói; os outros três comparam.
  const strip: Array<{
    label: string;
    value: string;
    heroi?: boolean;
    nota?: string;
    notaAlerta?: boolean;
  }> = report
    ? [
        {
          label: "Investimento",
          value: money.format(report.totals.spend),
          heroi: true,
          // Procedência colada ao número que ela certifica. Vivia num chip
          // solto acima da faixa, sem dizer de QUAL número falava — e um
          // pílulo a mais é filete a mais numa tela que já tinha demais.
          nota: report.source === "meta_live" ? "dados vivos da Meta" : undefined,
        },
        { label: "Leads", value: String(leads) },
        {
          label: "CPL médio",
          value: reconciliacao?.cplGlobal !== null && reconciliacao?.cplGlobal !== undefined
            ? money.format(reconciliacao.cplGlobal)
            : "—",
          // Curto de propósito: a frase inteira já vem logo abaixo, e repetir
          // o motivo dentro do rótulo empurrava a faixa para duas linhas —
          // duas frases dizendo o mesmo é o ruído que este passe remove.
          // "sem lastro" é o vocabulário que o produto já usa para isto.
          nota: reconciliacao?.cplGlobal === null ? "sem lastro" : undefined,
          notaAlerta: reconciliacao?.cplGlobal === null,
        },
        { label: "Campanhas", value: String(report.totals.campaigns) },
      ]
    : [];

  /**
   * PARA ONDE A VERBA FOI — a faixa de alocação.
   *
   * Por que aqui cabe gráfico e no resto da tela não: a tabela já diz o share
   * de CADA linha, mas ler sete porcentagens não responde "a verba está
   * concentrada ou pulverizada?" — e é essa a pergunta que decide realocação.
   * Uma faixa de 100% responde no primeiro olhar, e responde o que a soma dos
   * números isolados não responde.
   *
   * Sem gasto medido a faixa NÃO é desenhada. Barra de largura zero pareceria
   * "verba distribuída em nada"; a frase diz o que falta.
   */
  const alocacao = useMemo(() => {
    const total = rows.reduce((soma, row) => soma + (row.spend > 0 ? row.spend : 0), 0);
    if (total <= 0) return null;
    const ordenadas = [...rows].filter((row) => row.spend > 0).sort((a, b) => b.spend - a.spend);
    const topo = ordenadas.slice(0, 6);
    const resto = ordenadas.slice(6);
    const restoSpend = resto.reduce((soma, row) => soma + row.spend, 0);
    const fatias = [
      ...topo.map((row) => ({ key: row.key, label: row.label, spend: row.spend, pct: (row.spend / total) * 100, resto: false })),
      ...(restoSpend > 0
        ? [{ key: "__resto__", label: `outras ${resto.length}`, spend: restoSpend, pct: (restoSpend / total) * 100, resto: true }]
        : []),
    ];
    // Concentração: quanto da verba está nas duas maiores. É o número que
    // transforma a faixa em decisão — não em enfeite.
    const concentracao = fatias.slice(0, 2).reduce((soma, f) => soma + f.pct, 0);
    return { total, fatias, concentracao, dimensoes: ordenadas.length };
  }, [rows]);

  return (
    <div className="space-y-4 pb-10" data-marketing-layout="cc6-live-hub">
      <PageHeader
        eyebrow="Marketing · Andromeda"
        title="Hub de marketing"
        description="Verba, decisões da IA e saúde criativa em uma tela — a venda consolida no CRM."
      />

      {/* A linha de estado que morava aqui misturava duas camadas da régua num
          bloco de primeiro nível só, acima da dobra:

            · PROCEDÊNCIA ("dados vivos da Meta") — é lastro do número herói.
              Solta num chip próprio ela não dizia DE QUE número falava; agora
              vive colada ao Investimento, dentro da faixa de verba.
            · CARIMBO DE FRESCOR (hora + cadência de refresh) — é AUDITORIA.
              Desceu para o rodapé, ao lado de "como as IAs decidem".

          Nenhuma palavra saiu da tela, e a dobra deixou de gastar uma faixa
          inteira (linha + gap ≈ 36px) com auditoria. A cauda "venda consolida
          no CRM" também parou de existir em dois lugares vizinhos: ela já é a
          última frase da descrição do cabeçalho, que aparece SEMPRE — o chip
          só aparecia com a Meta viva. Ficou onde nunca falta. */}

      {cost.status === "loading" ? (
        <div className="space-y-4" aria-busy="true">
          <AtlasSkeleton className="h-20 w-full" />
          <AtlasSkeleton className="h-48 w-full" />
          <AtlasSkeleton className="h-64 w-full" />
        </div>
      ) : null}
      <GateCard state={cost} onRetry={retry} waiting="Relatório de custos aguardando ativação do banco." />

      {report?.coverage && !report.coverage.complete ? (
        <p role="status" className="cc6-panel-quiet cc6-reveal px-4 py-3 text-corpo leading-5 text-[var(--atlas-estado-atencao)]">
          ⚠️ Leitura incompleta: {[
            report.coverage.leadsTruncated ? "leads/vendas" : null,
            report.coverage.spendTruncated ? "investimento" : null,
            report.coverage.campaignsTruncated ? "campanhas" : null,
          ].filter(Boolean).join(", ")} atingiram o teto de paginação. Os números abaixo são MÍNIMOS
          observados, não totais — não decida pausa de campanha por eles.
        </p>
      ) : null}

      {/* ═══ A PERGUNTA DO DIRETOR, ANTES DE QUALQUER ABA ═══════════════════
          Esta faixa vivia DENTRO da etapa "desempenho", em quarta posição —
          e a etapa abre em "decidir" quando o stop loss aciona. Ou seja: no
          dia em que a verba mais importava, a tela não mostrava verba
          nenhuma sem trocar de aba. Para onde o dinheiro foi não é conteúdo
          de aba: é o eixo da tela. Sai da aba e sobe.

          Junto sobem os três números do plano que EXIGEM decisão —
          desperdício, economia possível, quantos produtos estão caros. Eles
          moravam numa linha cinza dentro de "Decisões da IA", na etapa
          "agir", que o diretor só abre depois de já ter decidido. */}
      {report ? (
        <section aria-label="Verba da semana" className="cc6-panel cc6-reveal overflow-hidden">
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 px-5 py-4 sm:grid-cols-4">
            {strip.map((item) => (
              <div key={item.label} className={item.heroi ? "col-span-2 sm:col-span-1" : undefined}>
                <p className={`cc6-metric-value leading-none ${item.heroi ? "text-heroi" : "text-numero"}`}>{item.value}</p>
                {/* O acento aqui é utilitário do Tailwind num SPAN — `.cc6-metric-label`
                    é layer-less e venceria a camada de utilitários, mas só casa com o
                    <p>, não com o filho, então o utilitário é a única regra que atinge
                    o span. Contraste medido de `--atlas-accent`: 5,78 sobre o painel do
                    tema claro, 5,14 sobre `--atlas-surface-subtle`, 5,38 sobre o painel
                    do tema escuro. Passa AA nos dois temas e nos dois fundos. */}
                <p className="cc6-metric-label mt-1.5">
                  {item.label}
                  {/* Acento = PROCEDÊNCIA ("dados vivos da Meta"). Recusa de
                      cálculo não é procedência: ela vai com a tinta de atenção,
                      senão as duas notas dizem a mesma coisa em azul. */}
                  {item.nota ? (
                    <span
                      className={
                        item.notaAlerta
                          ? "text-[var(--atlas-estado-atencao)]"
                          : "text-[var(--atlas-accent)]"
                      }
                    >
                      {" "}
                      · {item.nota}
                    </span>
                  ) : null}
                </p>
              </div>
            ))}
          </div>

          {/* A frase que impede o número inventado de voltar. Sem borda nova:
              o painel já separa, e filete a 12px do grid seria textura.
              Só existe quando a recusa acontece — quando as duas pontas se
              encontram, o CPL fala por si e esta linha some. */}
          {reconciliacao?.porqueSemCpl ? (
            <p className="px-5 pb-4 text-corpo leading-5 text-[var(--atlas-texto-medio)]">
              <span className="font-semibold text-[var(--atlas-estado-atencao)]">CPL não calculado.</span>{" "}
              {reconciliacao.porqueSemCpl}
            </p>
          ) : null}

          {/* ═══ O CONTROLE MORA ONDE ELE MANDA ═══════════════════════════
              O seletor de dimensão (Campanha · Projeto · Incorporador) vivia
              LÁ EMBAIXO, no cabeçalho da tabela "Custo → CRM", que só existe
              dentro da etapa "Desempenho". Mas ele governa TAMBÉM esta faixa,
              que é a resposta à pergunta do diretor e mora acima da dobra:
              a tela dizia "por campanha" e não havia como trocar sem abrir
              outra aba. Pior no estado sem lastro — a dimensão vazia travava
              o diretor fora das dimensões que TÊM gasto medido.

              Agora é um controle só, no lugar onde ele decide, sempre
              visível. A tabela continua obedecendo o mesmo `dim` e passou a
              declarar por escrito qual corte está mostrando. Nenhum recurso
              saiu: um controle deixou de existir em duplicata.

              O cabeçalho fica FORA do `alocacao ?` de propósito — sem lastro
              o seletor precisa continuar clicável. */}
          <div className="cc6-hairline flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-2.5">
            <p className="cc6-metric-label">Para onde a verba foi</p>
            <div role="tablist" aria-label="Dimensão do agregado" className="flex flex-wrap gap-1.5">
              {DIMS.map((item) => (
                <button
                  key={item.id}
                  role="tab"
                  aria-selected={dim === item.id}
                  onClick={() => setDim(item.id)}
                  className={`cc6-chip cc6-interativo ${dim === item.id ? "cc6-destaque text-[var(--atlas-accent)]" : "hover:text-[var(--atlas-texto-forte)]"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {/* Sem `cc6-num` de propósito. No tema claro,
                `:root[data-theme="light"] .cc6-num` repinta a classe inteira
                de laranja (#b45309) e vence o utilitário de cor — Tailwind é
                `@layer utilities`, e a regra do globals é sem camada. Com
                `cc6-num` este número diria "atenção" num tema e "neutro" no
                outro. Classe e cor são um par. */}
            {alocacao ? (
              <p className="ml-auto text-rotulo tabular-nums text-[var(--atlas-texto-medio)]">
                {alocacao.concentracao.toFixed(0)}% em {Math.min(2, alocacao.fatias.length)} de {alocacao.dimensoes}
              </p>
            ) : null}
          </div>

          {/* A faixa de alocação. Legenda e barra na MESMA linha de leitura:
              a cor de cada fatia é a mesma opacidade do acento, escalonada —
              a ordem já é a informação, e matiz aleatório aqui seria enfeite. */}
          {alocacao ? (
            <div className="px-5 pb-3">
              <svg
                viewBox="0 0 100 4" preserveAspectRatio="none" className="mt-2 h-2.5 w-full" role="img"
                aria-label={`Alocação do investimento: ${alocacao.fatias.map((f) => `${f.label} ${f.pct.toFixed(0)}%`).join(", ")}`}
              >
                {alocacao.fatias.map((fatia, i) => {
                  const x = alocacao.fatias.slice(0, i).reduce((soma, f) => soma + f.pct, 0);
                  return (
                    <rect
                      key={fatia.key} x={x} y="0" width={Math.max(0, fatia.pct - 0.3)} height="4" rx="0.6"
                      fill={fatia.resto
                        ? "color-mix(in srgb, var(--atlas-texto-fraco) 55%, transparent)"
                        : `color-mix(in srgb, var(--atlas-accent) ${Math.max(42, 100 - i * 11)}%, transparent)`}
                    >
                      <title>{`${fatia.label} · ${money.format(fatia.spend)} · ${fatia.pct.toFixed(1)}%`}</title>
                    </rect>
                  );
                })}
              </svg>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {alocacao.fatias.map((fatia) => (
                  <li key={fatia.key} className="flex min-w-0 items-baseline gap-1.5">
                    <span className="min-w-0 text-rotulo leading-5 text-[var(--atlas-texto-medio)]">{fatia.label}</span>
                    <span className="shrink-0 text-rotulo font-semibold tabular-nums text-[var(--atlas-texto-forte)]">{fatia.pct.toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            /* Sem filete próprio e sem repetir "Para onde a verba foi": o
               cabeçalho logo acima já é dono do título e da separação. Dois
               filetes a 20px um do outro não separam nada — viram textura. */
            <p className="px-5 pb-3 text-corpo leading-5 text-[var(--atlas-texto-fraco)]">
              Sem lastro — nenhuma linha desta dimensão tem investimento medido.
              Falta o gasto por {(DIMS.find((d) => d.id === dim)?.label ?? "campanha").toLowerCase()} vindo da
              API de anúncios; sem ele a alocação seria desenho, não medição.
            </p>
          )}

          {/* Mesma razão do bloco acima: `cc6-num` aqui apagaria o verde de
              "eficientes" e o vermelho de "caros" no tema claro — a cor É a
              informação nesta linha. `tabular-nums` dá o alinhamento sem
              sequestrar a cor. */}
          <div className="cc6-hairline flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-2.5 tabular-nums">
            <span className="text-rotulo font-semibold text-[var(--atlas-estado-atencao)]">
              desperdício {money.format(report.plan.summary.desperdicioSemanal)}/sem
            </span>
            <span className="text-rotulo text-[var(--atlas-texto-medio)]">
              economia possível {money.format(report.plan.summary.economiaPotencial)}
            </span>
            <span className="text-rotulo text-[var(--atlas-estado-sucesso)]">{report.plan.summary.produtosEficientes} eficientes</span>
            <span className="text-rotulo text-[var(--atlas-estado-perigo)]">{report.plan.summary.produtosCaros} caros</span>
            <span className="ml-auto text-rotulo text-[var(--atlas-texto-fraco)]">
              {report.plan.moves.length} movimento(s) propostos · aba Agir
            </span>
          </div>
        </section>
      ) : null}

      {/* ALERTA DE ATENDIMENTO — a decisão mais cara desta tela.
          Ele nasceu dentro da etapa "desempenho", numa caixa com borda
          própria dentro do painel. Lead paga e não atendida queima verba
          AGORA, e ainda ensina o Andromeda a comprar o público errado: é
          fila sem dono, e fila sem dono não espera troca de aba. Sai da aba,
          perde a caixa e vira faixa de severidade. */}
      {performance.status === "ok" && performance.data.alertas.length ? (
        <section aria-label="Alertas de atendimento da campanha" className="cc6-panel cc6-reveal overflow-hidden">
          {performance.data.alertas.map((alerta, i) => (
            <div
              key={alerta.titulo}
              role={alerta.nivel === "critico" ? "alert" : "status"}
              /* A hairline separa linhas; na primeira ela só duplicaria a
                 borda do painel — filete que não separa nada é ruído. */
              className={`cc6-sev-band flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 pl-5 pr-5 ${i > 0 ? "cc6-hairline" : ""}`}
              style={{ "--cc6-sev": alerta.nivel === "critico" ? "var(--atlas-estado-perigo)" : "var(--atlas-estado-atencao)" } as CSSProperties}
            >
              <span className={`text-corpo font-semibold ${alerta.nivel === "critico" ? "text-[var(--atlas-estado-perigo)]" : "text-[var(--atlas-estado-atencao)]"}`}>
                {alerta.titulo}
              </span>
              <span className="min-w-0 flex-1 basis-full text-corpo leading-5 text-[var(--atlas-texto-medio)] sm:basis-auto">{alerta.detalhe}</span>
              <span className="basis-full text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">{alerta.acao}</span>
            </div>
          ))}
        </section>
      ) : null}

      {/* ETAPAS — o ciclo da agência, uma de cada vez.
          Duas famílias de contador, e a diferença importa:

            · URGENTE (vermelho) — stop loss acionado e lead represada. É verba
              já queimada ou prestes a queimar; grita mesmo de outra etapa.
            · PARADO (neutro) — proposta esperando aprovação em Criativo e em
              Agir. Precisa ser VISTA sem clique, mas se as cinco abas
              gritassem juntas nenhuma seria lida — que é o que a própria
              folha de estilo já dizia sobre pintar a aba inteira.

          "Desempenho" segue sem contador de propósito: ali não há fila, há
          medição. Pastilha zerada é enfeite. */}
      <nav aria-label="Etapas da operação de mídia" className="atlas-etapas">
        {([
          ["decidir", "Decidir", stopLoss && stopLoss.acao !== "seguir" ? stopLoss.decisoes.length : 0, true],
          ["entrada", "Entrada", represa?.disponivel ? represa.totalRepresado : 0, true],
          ["desempenho", "Desempenho", 0, false],
          ["criativo", "Criativo", rotacoesPropostas, false],
          ["agir", "Agir", movimentosPropostos + prescricoesPropostas, false],
        ] as const).map(([chave, rotulo, contagem, urgente]) => (
          <button
            key={chave}
            type="button"
            onClick={() => setEtapa(chave)}
            data-ativa={etapa === chave ? "true" : undefined}
            data-alerta={urgente && contagem > 0 ? "true" : undefined}
            aria-current={etapa === chave ? "step" : undefined}
            aria-label={contagem > 0 ? `${rotulo} · ${contagem} ${urgente ? "em aberto" : "proposta(s) aguardando"}` : undefined}
          >
            {rotulo}
            {/* Sem `cc6-num`: no tema claro a folha repinta QUALQUER número
                dessa classe de âmbar, por cima do utilitário — e aqui isso
                vencia até a regra `[data-alerta] span`, que existe justamente
                para deixar a pastilha urgente vermelha. A pastilha saía âmbar
                nos dois casos: urgente e neutra na mesma cor. A folha já dá
                `tabular-nums` a este span, então nada se perde. */}
            {contagem > 0 ? <span>{contagem}</span> : null}
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
                    {/* Medido no navegador: este botão saía com 27px de altura
                        — o menor alvo da tela era o ÚNICO gesto que muda estado
                        nela (redige a decisão e a manda para /approvals).
                        `min-height` não é declarado por `.atlas-stop-loss-acao
                        button` em globals.css, então o utilitário alcança sem
                        precisar de `!`. A largura mínima existe para que
                        "Enviando…" não encolha o botão sob o cursor — estado de
                        carregamento não pode mover layout. */}
                    <button
                      type="button"
                      className="min-h-11 min-w-[168px]"
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
            <p className="cc6-num ml-auto text-rotulo text-[var(--atlas-texto-fraco)]">
              {represa.totalRepresado} lead(s) fora do CRM · {represa.formulariosComRepresa} formulário(s)
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void carregarRepresa()}
            disabled={carregandoRepresa}
            className={`min-h-11 rounded-lg border border-[var(--atlas-border)] px-3 text-rotulo font-semibold text-[var(--atlas-texto-forte)] transition hover:border-[var(--atlas-border-strong)] hover:text-[var(--atlas-texto-forte)] disabled:opacity-50 ${represa?.disponivel ? "" : "ml-auto"}`}
          >
            {carregandoRepresa ? "Apurando…" : represa ? "Atualizar" : "Apurar represa"}
          </button>
        </div>

        {!represa ? (
          <p className="px-5 pb-4 text-corpo leading-5 text-[var(--atlas-texto-fraco)]">
            Mostra quantas leads já pagas estão na Meta e ainda não entraram no CRM, formulário a
            formulário. Liberar é ato da diretoria: cada lead liberada nasce com o relógio de
            primeiro contato correndo.
          </p>
        ) : !represa.disponivel ? (
          <p className="px-5 pb-4 text-corpo leading-5 text-[var(--atlas-texto-fraco)]">{represa.motivo}</p>
        ) : !represa.represadas.length ? (
          <p className="px-5 pb-4 text-corpo leading-5 text-[var(--atlas-texto-medio)]">
            Nenhuma lead represada — tudo que a Meta tem já está no CRM.
          </p>
        ) : (
          <>
            {represa.aviso ? (
              /* Caixa dentro de caixa vira faixa de severidade: mesma
                 informação, um filete de 3px no lugar de uma borda inteira. */
              <p
                className="cc6-hairline cc6-sev-band py-2.5 pl-5 pr-5 text-corpo leading-5 text-[var(--atlas-estado-atencao)]"
                style={{ "--cc6-sev": "var(--atlas-estado-atencao)" } as CSSProperties}
              >
                {represa.aviso}
              </p>
            ) : null}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-corpo">
                <thead>
                  <tr className="text-micro uppercase tracking-[.12em] text-[var(--atlas-texto-fraco)]">
                    <th className="px-5 py-2 font-semibold">Formulário</th>
                    <th className="px-3 py-2 text-right font-semibold">Represadas</th>
                    <th className="px-3 py-2 text-right font-semibold">Já entraram</th>
                    <th className="px-5 py-2 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {represa.represadas.slice(0, 12).map((linha) => (
                    <tr key={linha.formId} className="cc6-hairline">
                      <td className="px-5 py-2.5">
                        <label className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={selecionados.includes(linha.formId)}
                            disabled={!represa.podeLiberar || !linha.registrada}
                            onChange={(e) => setSelecionados((atual) => e.target.checked
                              ? [...atual, linha.formId]
                              : atual.filter((id) => id !== linha.formId))}
                            className="size-4 accent-[var(--atlas-accent)] disabled:opacity-40"
                          />
                          <span className="text-[var(--atlas-texto-forte)]">{linha.nome ?? linha.formId}</span>
                        </label>
                      </td>
                      <td className="cc6-num px-3 py-2.5 text-right font-semibold text-[var(--atlas-texto-forte)]">{linha.represadas}</td>
                      <td className="cc6-num px-3 py-2.5 text-right text-[var(--atlas-texto-fraco)]">{linha.jaEntraram}</td>
                      <td className="px-5 py-2.5 text-rotulo">
                        {!linha.registrada ? (
                          <span className="text-[var(--atlas-estado-perigo)]">não registrado — descarta lead nova</span>
                        ) : linha.ativa ? (
                          <span className="text-[var(--atlas-texto-medio)]">ativo</span>
                        ) : (
                          <span className="text-[var(--atlas-estado-atencao)]">inativo — descarta lead nova</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {represa.podeLiberar ? (
              <div className="flex flex-wrap items-center gap-2 cc6-hairline px-5 py-3">
                <span className="text-rotulo text-[var(--atlas-texto-fraco)]">
                  {selecionados.length
                    ? `${selecionados.reduce((soma, id) => soma + (represa.represadas.find((l) => l.formId === id)?.represadas ?? 0), 0)} lead(s) em ${selecionados.length} formulário(s)`
                    : "Selecione os formulários a liberar"}
                </span>
                <div className="ml-auto flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!selecionados.length || liberando}
                    onClick={() => void liberarSelecionados(false)}
                    className="min-h-11 rounded-lg border border-[var(--atlas-border)] px-3 text-rotulo font-semibold text-[var(--atlas-texto-forte)] transition hover:border-[var(--atlas-border-strong)] disabled:opacity-40"
                  >
                    Liberar sem distribuir
                  </button>
                  <button
                    type="button"
                    disabled={!selecionados.length || liberando}
                    onClick={() => void liberarSelecionados(true)}
                    className="min-h-11 rounded-lg border border-[color-mix(in_srgb,var(--atlas-accent)_46%,transparent)] bg-[color-mix(in_srgb,var(--atlas-accent)_14%,transparent)] px-3 text-rotulo font-semibold text-[var(--atlas-texto-forte)] transition hover:bg-[color-mix(in_srgb,var(--atlas-accent)_24%,transparent)] disabled:opacity-40"
                  >
                    {liberando ? "Liberando…" : "Liberar e distribuir"}
                  </button>
                </div>
              </div>
            ) : (
              <p className="cc6-hairline px-5 py-3 text-rotulo text-[var(--atlas-texto-fraco)]">
                Liberar represa é da diretoria — move verba já gasta para a operação.
              </p>
            )}

            {resultadoDaLiberacao?.map((linha) => (
              <p key={linha} role="status" className="cc6-hairline px-5 py-2.5 text-rotulo leading-5 text-[var(--atlas-texto-medio)]">{linha}</p>
            ))}
          </>
        )}
      </section>

      {/* Formulários da Meta: de onde a lead entra. Fica antes do desempenho
          porque campanha sem formulário registrado não gera lead nenhuma — e o
          erro é silencioso: o webhook recebe e descarta. */}
      <section aria-label="Formulários de lead da Meta" hidden={foraDaEtapa("entrada")} className="cc6-panel cc6-reveal overflow-hidden">
        {/* ── A ENTRADA DA META, EM UMA LINHA ──────────────────────────────
            Responder "as leads da Meta estão entrando?" exigia abrir o Supabase
            e o Gerenciador de Anúncios lado a lado. O produto não sabia dizer.

            O estado NÃO é o silêncio: em 03/08/2026 fazia 6 dias sem evento e a
            integração estava perfeita — a lead mais nova na Meta era de 26/07,
            não havia o que entregar. Acender ali teria ensinado a operação a
            ignorar o vigia. O sintoma é a DIVERGÊNCIA: a Meta tem lead que o
            CRM não tem, e o tempo passa. */}
        {saudeDaEntrada ? (
          <div
            className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-5 py-3"
            style={{
              borderColor: "var(--atlas-border)",
              background: saudeDaEntrada.exigeAcao
                ? "color-mix(in srgb, var(--atlas-danger) 10%, transparent)"
                : "transparent",
            }}
          >
            <span aria-hidden className="text-numero leading-none">
              {saudeDaEntrada.estado === "mudo" ? "\u{1F507}"
                : saudeDaEntrada.estado === "atrasado" ? "\u{23F3}"
                : saudeDaEntrada.estado === "sem_configuracao" ? "\u{1F6AB}"
                : "\u{1F7E2}"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="cc6-eyebrow text-micro!">Entrada da Meta</p>
              <p className="text-corpo text-[var(--atlas-texto-forte)]">{saudeDaEntrada.resumo}</p>
            </div>
            <dl className="flex flex-wrap items-center gap-x-5 gap-y-1">
              {/* Volume por chegada, não por idade da lead: uma recuperação de
                  leads antigas apareceria como semana parada se contasse pela
                  data de origem. */}
              <div className="text-right">
                <dt className="cc6-eyebrow text-micro!">entraram · 24h</dt>
                <dd className="text-numero tabular-nums text-[var(--atlas-texto-forte)]">{saudeDaEntrada.volume.ultimas24h}</dd>
              </div>
              <div className="text-right">
                <dt className="cc6-eyebrow text-micro!">7 dias</dt>
                <dd className="text-numero tabular-nums text-[var(--atlas-texto-forte)]">{saudeDaEntrada.volume.ultimos7dias}</dd>
              </div>
              <div className="text-right">
                <dt className="cc6-eyebrow text-micro!">formulários ativos</dt>
                <dd className="text-numero tabular-nums text-[var(--atlas-texto-forte)]">
                  {saudeDaEntrada.fontes.ativas}<span className="text-rotulo opacity-60">/{saudeDaEntrada.fontes.registradas}</span>
                </dd>
              </div>
              {saudeDaEntrada.errosInesperados > 0 ? (
                <div className="text-right">
                  <dt className="cc6-eyebrow text-micro!">erros a olhar</dt>
                  <dd className="text-numero tabular-nums text-[var(--atlas-danger)]">{saudeDaEntrada.errosInesperados}</dd>
                </div>
              ) : null}
              {/* Importado sem lead vinculada é o pior estado silencioso: o
                  contador sobe e ninguém atende ninguém. Só aparece quando
                  existe — um zero permanente aqui vira ruído. */}
              {saudeDaEntrada.importadosSemLead > 0 ? (
                <div className="text-right">
                  <dt className="cc6-eyebrow text-micro!">importadas sem lead</dt>
                  <dd className="text-numero tabular-nums text-[var(--atlas-danger)]">{saudeDaEntrada.importadosSemLead}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : null}
        {/* ── CONECTAR PÁGINA / FORMULÁRIO ─────────────────────────────────
            Estes campos NÃO existiam. A tela mandava só `{ aplicar }` e a rota
            caía em META_PAGE_ID — que não está no ambiente do servidor. Em
            produção isso era 400 META_PAGE_AUSENTE, sempre, e o caminho da lead
            nunca podia ser configurado pelo produto.

            O ID da Página não é o da conta de anúncios. Colar um no lugar do
            outro faz a Graph responder erro de PERMISSÃO, e o diagnóstico erra
            de camada — `validarPageId` recusa aqui e diz o que o número é. */}
        <div className="grid gap-3 px-5 pt-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="cc6-eyebrow text-micro!">Nome da origem</span>
            <input value={nomeDaOrigem} onChange={(e) => setNomeDaOrigem(e.target.value)}
              placeholder="Inside · Senna" className="min-h-11 rounded-lg px-3 text-corpo" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="cc6-eyebrow text-micro!">ID da Página Meta</span>
            <input value={paginaMeta} onChange={(e) => setPaginaMeta(e.target.value)}
              inputMode="numeric" placeholder="só dígitos, sem act_" aria-describedby="ajuda-pagina-meta"
              className="min-h-11 rounded-lg px-3 text-corpo" />
            <span id="ajuda-pagina-meta" className="text-micro text-[var(--atlas-texto-fraco)]">
              É a Página que publica o anúncio — não a conta de anúncios.
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="cc6-eyebrow text-micro!">ID do formulário</span>
            <input value={formularioMeta} onChange={(e) => setFormularioMeta(e.target.value)}
              inputMode="numeric" disabled={todosOsFormularios}
              placeholder={todosOsFormularios ? "todos os formulários" : "só dígitos"}
              className="min-h-11 rounded-lg px-3 text-corpo disabled:opacity-40" />
          </label>
          <label className="flex items-center gap-2 self-end pb-1">
            <input type="checkbox" checked={todosOsFormularios}
              onChange={(e) => setTodosOsFormularios(e.target.checked)} className="size-4" />
            <span className="text-corpo text-[var(--atlas-texto-medio)]">Todos os formulários desta Página</span>
          </label>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2 px-5 pb-3 pt-4">
          <p className="cc6-eyebrow">Formulários da Meta</p>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void descobrirFormularios(false)}
              disabled={descobrindo}
              className="min-h-11 rounded-lg border border-[var(--atlas-border)] px-3 text-rotulo font-semibold text-[var(--atlas-texto-forte)] transition hover:border-[var(--atlas-border-strong)] hover:text-[var(--atlas-texto-forte)] disabled:opacity-50"
            >
              {descobrindo ? "Consultando…" : "Conferir na Meta"}
            </button>
            {formularios && formularios.novos.length > 0 ? (
              <button
                type="button"
                onClick={() => void descobrirFormularios(true)}
                disabled={descobrindo}
                className="min-h-11 rounded-lg border border-[color-mix(in_srgb,var(--atlas-accent)_46%,transparent)] bg-[color-mix(in_srgb,var(--atlas-accent)_14%,transparent)] px-3 text-rotulo font-semibold text-[var(--atlas-texto-forte)] transition hover:bg-[color-mix(in_srgb,var(--atlas-accent)_24%,transparent)] disabled:opacity-50"
              >
                Registrar {formularios.novos.length} (inativos)
              </button>
            ) : null}
          </div>
        </div>

        {erroDaDescoberta ? (
          <p
            role="alert"
            className="cc6-hairline cc6-sev-band py-2.5 pl-5 pr-5 text-corpo leading-5 text-[var(--atlas-estado-perigo)]"
            style={{ "--cc6-sev": "var(--atlas-estado-perigo)" } as CSSProperties}
          >
            {erroDaDescoberta}
          </p>
        ) : null}

        {!formularios ? (
          <p className="px-5 pb-4 text-corpo leading-5 text-[var(--atlas-texto-fraco)]">
            Confere quais formulários existem na Meta e quais o CRM conhece. Formulário não
            registrado entrega lead que o webhook descarta em silêncio.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 px-5 pb-3 text-rotulo text-[var(--atlas-texto-medio)]">
              <span className="cc6-chip">{formularios.encontradosNaMeta} na Meta</span>
              <span className="cc6-chip">{formularios.leadsAcumuladosNaMeta} lead(s) acumulada(s) lá</span>
              <span className="cc6-chip">{formularios.jaRegistrados} já no CRM</span>
              {formularios.simulacao ? <span className="cc6-chip">simulação — nada foi gravado</span> : null}
            </div>

            {formularios.fontesOrfas.length ? (
              <div
                role="alert"
                className="cc6-hairline cc6-sev-band py-2.5 pl-5 pr-5"
                style={{ "--cc6-sev": "var(--atlas-estado-perigo)" } as CSSProperties}
              >
                <p className="text-corpo font-semibold text-[var(--atlas-estado-perigo)]">
                  {formularios.fontesOrfas.length} fonte(s) apontam para formulário inexistente
                </p>
                <p className="mt-1 text-corpo leading-5 text-[var(--atlas-texto-medio)]">
                  {formularios.fontesOrfas.map((f) => `${f.nome ?? "sem nome"} (${f.formId})`).join(" · ")}
                </p>
                <p className="mt-1 text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
                  O backfill dessas fontes sempre trará zero. Nenhuma foi removida — a decisão é humana.
                </p>
              </div>
            ) : null}

            {formularios.novos.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-corpo">
                  <thead>
                    <tr className="text-micro uppercase tracking-[.12em] text-[var(--atlas-texto-fraco)]">
                      <th className="px-5 py-2 font-semibold">Formulário fora do CRM</th>
                      <th className="px-5 py-2 text-right font-semibold">Leads na Meta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formularios.novos.slice(0, 10).map((f) => (
                      <tr key={f.formId} className="cc6-hairline">
                        <td className="px-5 py-2.5 text-[var(--atlas-texto-forte)]">{f.nome ?? f.formId}</td>
                        <td className={`cc6-num px-5 py-2.5 text-right ${f.leads > 0 ? "text-[var(--atlas-texto-forte)]" : "text-[var(--atlas-texto-fraco)]"}`}>{f.leads}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {formularios.avisos.map((aviso) => (
              <p key={aviso} className="cc6-hairline px-5 py-3 text-rotulo leading-5 text-[var(--atlas-texto-medio)]">{aviso}</p>
            ))}
          </>
        )}
      </section>


      {report ? (
        <>
          {/* A faixa de 4 números saiu daqui: subiu para o topo, fora das
              etapas. Ver o bloco "Verba da semana". */}

          {/* (b) Coração da tela: decisões do plano da IA.

              "Subir campanha completa" ERA a primeira seção desta etapa, e o
              argumento era que ela é a única que cria alguma coisa. Mas a
              régua não ordena por criar/não-criar: ordena por decisão antes de
              informação. Quem abre "Agir" abre para responder ao que a IA
              PROPÔS — e encontrava um formulário de captação ocupando a
              primeira dobra da etapa, com os movimentos e as prescrições
              escondidos abaixo dele. A ferramenta desceu para depois das duas
              filas de proposta; continua exatamente com o mesmo conteúdo e o
              mesmo portão de permissão (`report`). */}
          <section aria-label="Decisões da IA" hidden={foraDaEtapa("agir")} className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "40ms" }}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pb-3 pt-4">
              <p className="cc6-eyebrow">Decisões da IA</p>
              {/* Desperdício, economia, eficientes e caros subiram para a faixa
                  de verba no topo — são decisão, e decisão não mora numa linha
                  cinza dentro da última aba. */}
              <p className="cc6-num ml-auto text-rotulo text-[var(--atlas-texto-fraco)]">
                {moves.length} de {report.plan.moves.length} movimento(s) · ordenados por prioridade
              </p>
            </div>
            {moves.length === 0 ? (
              <p className="cc6-hairline px-5 py-5 text-corpo text-[var(--atlas-texto-fraco)]">Nenhum movimento recomendado nesta janela.</p>
            ) : (
              moves.map((move, index) => {
                const proj = report.projection?.projections.find((p) => p.moveKind === move.kind && p.target === move.target);
                const dl = proj?.weeklyLeadsDelta;
                return (
                <div key={`${move.kind}-${move.target}-${index}`} className="cc6-hairline flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-2.5">
                  <span className={`cc6-chip ${MOVE_META[move.kind].ink}`}>{MOVE_META[move.kind].label}</span>
                  <span className="text-corpo font-medium text-[var(--atlas-texto-forte)]">{move.target}</span>
                  <span className="cc6-num text-micro uppercase tracking-[.1em] text-[var(--atlas-texto-fraco)]">{move.scope}</span>
                  {typeof move.amount === "number" ? <span className="cc6-num text-rotulo text-[var(--atlas-texto-medio)]">{money.format(move.amount)}</span> : null}
                  {dl && (dl.esperado !== 0 || dl.otimista !== 0 || dl.pessimista !== 0) ? (
                    <span className={`cc6-chip cc6-num ${dl.esperado >= 0 ? "cc6-ok" : "cc6-crit"}`} title={`Projeção · confiança ${proj?.confidence}`}>
                      {dl.esperado >= 0 ? "▲" : "▼"} {dl.pessimista > 0 ? "+" : ""}{dl.pessimista} a {dl.otimista > 0 ? "+" : ""}{dl.otimista} leads/sem
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 basis-full text-corpo leading-5 text-[var(--atlas-texto-medio)] sm:basis-auto">{move.reason}</span>
                  {/* Premissas visíveis: a faixa acima é derivada delas. Número
                      sem lastro à vista é o que faz o gestor desconfiar da IA. */}
                  {proj?.assumptions?.length ? (
                    <span className="basis-full text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">{proj.assumptions.join(" · ")}</span>
                  ) : null}
                </div>
                );
              })
            )}
          </section>

          {/* (c) Agregado por dimensão com barra de share inline. */}
          <section aria-label="Custos por dimensão" hidden={foraDaEtapa("desempenho")} className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "120ms" }}>
            {/* O seletor que ficava aqui subiu para a faixa de verba, que é
                quem ele governa e quem está acima da dobra. A tabela obedece
                o MESMO `dim` e agora diz por escrito qual corte mostra —
                antes o corte era mudo e só o botão aceso denunciava. */}
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pb-3 pt-4">
              <p className="cc6-eyebrow">Custo → CRM</p>
              <p className="text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
                por {(DIMS.find((item) => item.id === dim)?.label ?? "campanha").toLowerCase()} · o corte se
                troca na faixa de verba, no topo
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-corpo">
                <thead>
                  <tr className="cc6-hairline border-t-0! font-mono text-micro uppercase tracking-[.14em] text-[var(--atlas-texto-fraco)]">
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
                    <tr><td colSpan={7} className="cc6-hairline px-5 py-5 text-[var(--atlas-texto-fraco)]">Sem investimento atribuído nesta dimensão.</td></tr>
                  ) : (
                    rows.map((row) => {
                      const broken = attributionOf(row.key);
                      const note = broken ? attributionNote(broken.leadsUnlinked) : undefined;
                      /* Gasto que o CRM não conhece. Nomeado uma vez porque
                         DUAS células dependem dele: o investimento e a fatia.
                         `share` é `spend ÷ total` (lib/marketing/cost-report.ts),
                         ou seja, é DERIVADA do mesmo número ausente — imprimir
                         "0%" ali afirma "não consumiu verba nenhuma" com a
                         mesma autoridade com que a coluna ao lado admite não
                         saber. Ausência não vira zero em nenhuma das duas. */
                      const gastoNaoImportado = dim === "byCampaign" && row.spend === 0 && row.leads > 0;
                      return (
                      <tr key={row.key} className="cc6-hairline transition-colors hover:bg-[color-mix(in_srgb,var(--atlas-accent)_5%,transparent)]">
                        <td className="max-w-56 break-words px-5 py-2.5 font-medium text-[var(--atlas-texto-forte)]" title={row.label}>{row.label}</td>
                        {/* O MESMO defeito, do outro lado da tabela. A campanha
                            que trouxe as 24 leads saía com "R$ 0" — e R$ 0 lido
                            de relance é "não custou nada", quando a verdade é
                            que o CRM não conhece o gasto dela: ela não pertence
                            à conta de anúncios que o Atlas lê. É exatamente o
                            caso que `reconciliaInvestimento` chama de
                            `leadSemGasto`, e a frase no topo já o declara.
                            Só vale no corte por campanha, que é onde a
                            reconciliação por id externo faz sentido. */}
                        <td
                          className="cc6-num py-2.5 pr-4 text-right text-[var(--atlas-texto-forte)]"
                          title={
                            gastoNaoImportado
                              ? "Nenhuma linha de investimento importada para esta campanha — ela não está na conta de anúncios que o CRM lê. Zero aqui seria ausência de importação, não gasto medido."
                              : undefined
                          }
                        >
                          {gastoNaoImportado ? (
                            <span className="text-rotulo text-[var(--atlas-estado-atencao)]">gasto não importado</span>
                          ) : (
                            money.format(row.spend)
                          )}
                        </td>
                        {/* ═══ O ZERO QUE MENTIA ═══════════════════════════
                            Sete das oito campanhas desta conta saíam com "0"
                            nesta célula — e as sete gastaram entre R$ 341 e
                            R$ 991. Lido de relance, "0" é veredito: a campanha
                            rodou e não trouxe ninguém. A verdade é outra:
                            `leadsUnlinked` chega NULL, ou seja, o banco não
                            conseguiu medir quantas leads carregam o id externo
                            desta campanha — e as 24 leads que este CRM tem vêm
                            de uma campanha que nem está nesta conta.

                            Ausência de medição desenhada como zero é a mesma
                            classe de defeito que "0 vendas": some a diferença
                            entre "não trouxe" e "não sei". A célula passa a
                            dizer a palavra — `sem atribuição` — e o número só
                            volta quando existe número. A contagem continua
                            aparecendo sempre que ela é fato (leads > 0), com o
                            "+?" que já avisava que pode haver mais. */}
                        <td className="cc6-num py-2.5 pr-4 text-right text-[var(--atlas-texto-medio)]" title={note}>
                          {broken && row.leads === 0 ? (
                            <span className="text-rotulo text-[var(--atlas-estado-atencao)]">sem atribuição</span>
                          ) : (
                            <>
                              {row.leads}
                              {broken ? <span className="ml-1 text-rotulo text-[var(--atlas-estado-atencao)]">+?</span> : null}
                            </>
                          )}
                        </td>
                        <td className="cc6-num py-2.5 pr-4 text-right text-[var(--atlas-texto-medio)]" title={note}>{broken ? "—" : row.sales}</td>
                        <td className="cc6-num py-2.5 pr-4 text-right text-[var(--atlas-texto-medio)]" title={note}>{broken ? "—" : row.cpl !== null ? money.format(row.cpl) : "—"}</td>
                        <td className="cc6-num py-2.5 pr-4 text-right text-[var(--atlas-texto-medio)]" title={note}>{broken ? "—" : row.cac !== null ? money.format(row.cac) : "—"}</td>
                        {/* A barrinha de 3px que morava aqui reimprimia, em
                            forma, o MESMO número impresso a 6px de distância —
                            e a comparação entre linhas que ela prometia já é
                            respondida, melhor e acima da dobra, pela faixa
                            "Para onde a verba foi", que é 100% e mostra
                            concentração. Gráfico redundante é ruído com cara de
                            informação. O número fica; a forma sai. */}
                        <td
                          className="cc6-num py-2.5 pr-5 text-right text-rotulo text-[var(--atlas-texto-fraco)]"
                          title={
                            gastoNaoImportado
                              ? "Fatia da verba não calculável: ela é o gasto desta campanha dividido pelo total, e o gasto desta campanha não foi importado."
                              : undefined
                          }
                        >
                          {gastoNaoImportado ? "—" : `${row.share.toFixed(0)}%`}
                        </td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {dim === "byCampaign" && rows.some((row) => attributionOf(row.key)) ? (
              <p className="cc6-hairline px-5 py-2.5 text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
                “sem atribuição” na coluna de leads (e “+?” quando há contagem): a campanha tem leads sem elo
                de atribuição, ou o elo não é mensurável neste banco. “gasto não importado” em Invest.: a
                campanha trouxe lead e o CRM não tem nenhuma linha de investimento dela. Venda, CPL e CAC
                ficam ocultos de propósito — em todos esses casos o zero seria ausência de medição, não
                resultado.
              </p>
            ) : null}
          </section>

          {/* (d) Verba por produto com pacing como banda de severidade. */}
          {/* "Verba semanal" e "Verba da semana" (o painel do topo) eram dois
              rótulos quase idênticos para coisas diferentes: lá é o total da
              conta e a alocação; aqui é o RITMO de consumo, produto a produto.
              Nenhuma palavra saiu — o rótulo só passou a dizer qual das duas
              perguntas ele responde. */}
          <section aria-label="Verba semanal por produto · ritmo de consumo" hidden={foraDaEtapa("desempenho")} className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "180ms" }}>
            <p className="cc6-eyebrow px-5 pb-3 pt-4">Verba semanal por produto · ritmo</p>
            {report.budget.length === 0 ? (
              <p className="cc6-hairline px-5 py-5 text-corpo text-[var(--atlas-texto-fraco)]">Nenhuma verba semanal definida — use as decisões acima para definir metas.</p>
            ) : (
              report.budget.map((row) => (
                <div
                  key={`${row.product}-${row.developer}`}
                  className="cc6-hairline cc6-sev-band flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 pl-5 pr-5"
                  style={{ "--cc6-sev": PACING_META[row.pacing].sev } as CSSProperties}
                >
                  <span className="text-corpo font-medium text-[var(--atlas-texto-forte)]">{row.product}</span>
                  <span className="cc6-num text-micro uppercase tracking-[.1em] text-[var(--atlas-texto-fraco)]">{row.developer}</span>
                  <span className="cc6-num text-rotulo text-[var(--atlas-texto-medio)]">
                    {money.format(row.spent)} de {money.format(row.weeklyBudget)} · {row.pctUsed.toFixed(0)}% · {PACING_META[row.pacing].label}
                  </span>
                  <span className={`cc6-num text-rotulo ${VERDICT_INK[row.verdict]}`}>
                    {row.verdict === "sem_dados" ? "sem dados" : row.verdict}
                    {row.cac !== null ? ` · CAC ${money.format(row.cac)}` : ""}
                    {row.targetCac !== null ? ` / meta ${money.format(row.targetCac)}` : ""}
                  </span>
                  <span className="min-w-0 flex-1 basis-full text-corpo leading-5 text-[var(--atlas-texto-fraco)] sm:basis-auto sm:text-right">{row.recommendation}</span>
                </div>
              ))
            )}
          </section>
        </>
      ) : null}

      {/* (0) O que o CRM já sabe sobre a campanha, sem depender da Meta.
           Os ALERTAS deste bloco subiram para o topo da tela (fora das
           etapas): eles exigem decisão. O que ficou aqui é a medição —
           informação — e por isso vem depois da tabela de custo. */}
      {performance.status === "ok" && performance.data.resumo.leadsAtribuidas > 0 ? (
        <section aria-label="Campanha medida pelo CRM" hidden={foraDaEtapa("desempenho")} className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "220ms" }}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pb-3 pt-4">
            <p className="cc6-eyebrow">Campanha medida pelo CRM</p>
            <p className="cc6-num ml-auto text-rotulo text-[var(--atlas-texto-fraco)]">
              {performance.data.resumo.campanhas} campanha(s) · {performance.data.resumo.leadsAtribuidas} lead(s) atribuída(s)
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-corpo">
              <thead>
                <tr className="text-micro uppercase tracking-[.12em] text-[var(--atlas-texto-fraco)]">
                  <th className="px-5 py-2 font-semibold">Campanha · anúncio</th>
                  <th className="px-3 py-2 text-right font-semibold">Leads</th>
                  <th className="px-3 py-2 text-right font-semibold">Contatadas</th>
                  <th className="px-3 py-2 text-right font-semibold">Avançaram</th>
                  <th className="px-5 py-2 text-right font-semibold">CPL</th>
                </tr>
              </thead>
              <tbody>
                {performance.data.linhas.slice(0, 8).map((linha) => (
                  <tr key={`${linha.campanha}-${linha.anuncio}-${linha.canal}`} className="cc6-hairline">
                    <td className="px-5 py-2.5">
                      <span className="cc6-num text-[var(--atlas-texto-forte)]">{linha.campanha}</span>
                      <span className="ml-2 text-rotulo text-[var(--atlas-texto-fraco)]">{linha.canal ?? "—"}</span>
                    </td>
                    <td className="cc6-num px-3 py-2.5 text-right text-[var(--atlas-texto-forte)]">{linha.leads}</td>
                    <td className={`cc6-num px-3 py-2.5 text-right ${linha.contatados === 0 ? "text-[var(--atlas-estado-perigo)]" : "text-[var(--atlas-texto-forte)]"}`}>
                      {linha.contatados}
                      {linha.taxaContato !== null ? (
                        <span className="ml-1 text-micro text-[var(--atlas-texto-fraco)]">{Math.round(linha.taxaContato * 100)}%</span>
                      ) : null}
                    </td>
                    <td className="cc6-num px-3 py-2.5 text-right text-[var(--atlas-texto-forte)]">{linha.avancaram}</td>
                    {/* Sem a API de anúncios não há CPL. Traço, nunca R$ 0,00. */}
                    <td className="cc6-num px-5 py-2.5 text-right text-[var(--atlas-texto-fraco)]">
                      {linha.cpl === null ? "—" : linha.cpl.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!performance.data.metricasDeMidia.disponivel ? (
            <p className="cc6-hairline px-5 py-3 text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
              {performance.data.metricasDeMidia.motivo} <span className="text-[var(--atlas-texto-medio)]">{performance.data.metricasDeMidia.proximaAcao}</span>
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Funil real de cada criativo.
          Fica FORA do condicional da Andromeda de propósito: aquele bloco só
          existe quando a Meta responde, e este painel mede as leads do CRM —
          funciona sem credencial nenhuma. Amarrá-lo à Andromeda esconderia
          justamente a parte que hoje é mensurável. */}
      <section aria-label="Funil real de cada criativo" hidden={foraDaEtapa("criativo")} className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "220ms" }}>
          {/* Cabeçalho de uma linha, como o resto da tela: eram três blocos
              empilhados (eyebrow, título e parágrafo) dizendo a mesma coisa
              em três alturas. Nenhuma palavra saiu. */}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pb-3 pt-4">
            <h3 className="cc6-eyebrow">Qual peça traz lead que fecha</h3>
            <p className="min-w-0 flex-1 text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
              Agência · o que acontece depois do clique — a Meta mostra CTR e custo por clique. Isto mostra
              atendimento, visita e venda: a metade que decide criativo, e a única que não depende da
              permissão de leitura da conta.
            </p>
          </div>
          <div className="px-5 pb-5"><CreativeFunnelPanel /></div>
        </section>

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
            <p className="cc6-hairline px-5 py-2.5 text-corpo leading-5 text-[var(--atlas-estado-atencao)]">🔮 {andromeda.data.forecast.anomalies.join(" · ")}</p>
          ) : null}
          {andromeda.data.rotations?.proposals?.length ? (
            <div className="cc6-hairline px-5 py-2.5">
              <p className="text-corpo leading-5 text-[var(--atlas-texto-medio)]">🔄 {andromeda.data.rotations.summary}</p>
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
                    <span className="min-w-0 break-words text-corpo text-[var(--atlas-texto-forte)]">{rot.pauseAd?.adName ?? "anúncio fatigado"}</span>
                    <span className="cc6-num text-micro uppercase tracking-[.1em] text-[var(--atlas-texto-fraco)]">{rot.campaignName}</span>
                  </div>
                  {/* Sinais de fadiga eram tooltip — invisíveis no toque e no leitor
                      de tela. São o lastro do "pausar": ficam na linha. */}
                  {rot.pauseAd?.signals?.length ? (
                    <p className="cc6-num mt-1 text-rotulo leading-5 text-[var(--atlas-estado-atencao)]">{rot.pauseAd.signals.join(" · ")}</p>
                  ) : null}
                  <p className="mt-1 text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">{rot.reason}</p>
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="cc6-chip cc6-ok">substituir por</span>
                    <span className="cc6-num text-rotulo text-[var(--atlas-texto-medio)]">ângulo {rot.replacement.angle}</span>
                  </div>
                  {rot.replacement.copy ? (
                    <div className="mt-1.5 space-y-1">
                      <p className="text-corpo leading-5 text-[var(--atlas-texto-forte)]">{rot.replacement.copy.primaryText}</p>
                      <p className="text-rotulo leading-5 text-[var(--atlas-texto-medio)]">
                        <b className="text-[var(--atlas-texto-medio)]">{rot.replacement.copy.headline}</b>
                        {rot.replacement.copy.description ? ` · ${rot.replacement.copy.description}` : ""}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1.5 text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">Substituto sem copy redigido — a peça precisa de brief do produto para ser proposta.</p>
                  )}
                  <p className="cc6-num mt-2 text-micro uppercase tracking-[.1em] text-[var(--atlas-texto-fraco)]">proposta · nada é pausado ou publicado automaticamente</p>
                </div>
              ))}
              {andromeda.data.rotations.proposals.length > 4 ? (
                <p className="cc6-num mt-2 text-rotulo text-[var(--atlas-texto-fraco)]">+{andromeda.data.rotations.proposals.length - 4} rotações propostas</p>
              ) : null}
            </div>
          ) : null}
          {andromeda.data.health.map((item) => (
            <div key={item.campaignId} className="cc6-hairline flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
              {/* Dois defeitos na mesma linha, e os dois eram silenciosos:
                  · 30px (`text-3xl`) é um degrau que a escala não tem. Este é
                    um número de COMPARAR campanha com campanha — `text-numero`.
                    O herói da tela é o Investimento, e só ele.
                  · O score aparecia nu. 62 do quê? A escala é 0–100 (o próprio
                    policy-engine escreve "score X/100" na justificativa que
                    esta mesma tela mostra). O denominador é fato medido, não
                    enfeite: sem ele o número não decide nada. */}
              <p className={`cc6-metric-value flex w-14 items-baseline leading-none ${item.andromedaScore < 50 ? "cc6-crit" : item.andromedaScore < 70 ? "cc6-warn" : "cc6-ok"}`}>
                <span className="text-numero">{Math.round(item.andromedaScore)}</span>
                <span className="text-micro opacity-70">/100</span>
              </p>
              <div className="min-w-0">
                <p className="break-words text-corpo font-medium text-[var(--atlas-texto-forte)]">{item.campaignName}</p>
                <p className="cc6-num mt-0.5 text-rotulo text-[var(--atlas-texto-fraco)]">{item.activeAds} anúncios ativos · diversidade {Math.round(item.diversityScore)}/100</p>
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
        <p className="cc6-panel-quiet cc6-reveal p-4 text-corpo leading-6 text-[var(--atlas-texto-fraco)]">Andromeda · saúde criativa aguardando ativação.</p>
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
        const accent = "var(--atlas-accent)";
        return (
          <section aria-label="Análise preditiva" hidden={foraDaEtapa("criativo")} className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "260ms" }}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pb-3 pt-4">
              <p className="cc6-eyebrow">Análise preditiva · conta</p>
              <span className="text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">histórico real (linha) + projeção (tracejado) · confiança {conf}</span>
            </div>
            <div className="px-5 pb-2">
              <svg viewBox={`0 0 ${W} ${H}`} className="h-[112px] w-full" role="img" aria-label={`Leads por semana em ${hist.length} semanas; projeção de ${p.pessimista} a ${p.otimista} na próxima`}>
                <path d={line} fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                <path d={`M${lastPt.x.toFixed(1)},${lastPt.y.toFixed(1)} L${projPt.x.toFixed(1)},${projPt.y.toFixed(1)}`} fill="none" stroke={accent} strokeWidth="2" strokeDasharray="5 4" opacity="0.7" />
                {pts.map((q, i) => <circle key={i} cx={q.x} cy={q.y} r="2.5" fill={accent} />)}
                <circle cx={projPt.x} cy={projPt.y} r="3.5" fill="none" stroke={accent} strokeWidth="2" />
              </svg>
            </div>
            {/* `text-lg` (18px) é um degrau inventado entre corpo (13) e número
                (20) — o mesmo hábito que a escala foi criada para acabar. Os
                três são números de comparar: `text-numero`. */}
            <div className="cc6-hairline grid gap-4 px-5 py-3 sm:grid-cols-3">
              <div><p className="cc6-metric-label">Leads próx. semana</p><p className="cc6-metric-value mt-1 text-numero leading-none">{p.pessimista === p.otimista ? p.esperado : `${p.pessimista}–${p.otimista}`}</p></div>
              <div><p className="cc6-metric-label">CPL projetado</p><p className="cc6-metric-value mt-1 text-numero leading-none">{f.account.projectedCpl == null ? "—" : money.format(f.account.projectedCpl)}</p></div>
              <div><p className="cc6-metric-label">Semanas medidas</p><p className="cc6-metric-value mt-1 text-numero leading-none">{hist.length}</p></div>
            </div>
            {f.account.assumptions.length ? (
              <p className="cc6-hairline px-5 py-2.5 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">{f.account.assumptions.join(" · ")}</p>
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
              <span className="text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">onde responde · onde vaza · quem responde</span>
            </div>
            <div className="cc6-hairline grid gap-5 px-5 py-4 sm:grid-cols-3">
              <div>
                <p className="cc6-metric-label mb-2">Onde responde</p>
                {a.placements.length ? a.placements.slice(0, 4).map((p, i) => (
                  <div key={`${p.platform}-${p.position}-${i}`} className="mb-2 flex items-baseline justify-between gap-2">
                    <span className="min-w-0 break-words text-corpo text-[var(--atlas-texto-forte)]">{p.platform}{p.position ? ` · ${p.position}` : ""}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="cc6-num text-corpo text-[var(--atlas-texto-medio)]">{cpl(p.cpl)}</span>
                      <span className={`cc6-chip ${chip(p.verdict)}`} title={p.reason}>{p.verdict}</span>
                    </span>
                  </div>
                )) : <p className="text-corpo leading-5 text-[var(--atlas-texto-fraco)]">Sem dados de posicionamento ainda.</p>}
              </div>
              <div>
                <p className="cc6-metric-label mb-2">Onde vaza</p>
                {a.geo ? (
                  <>
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <span className="text-corpo text-[var(--atlas-texto-forte)]">Fora da praça</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="cc6-num text-corpo text-[var(--atlas-texto-medio)]">{a.geo.leak.sharePct}%</span>
                        <span className={`cc6-chip ${chip(a.geo.verdict)}`}>{a.geo.verdict}</span>
                      </span>
                    </div>
                    {a.geo.leak.topRegions.slice(0, 3).map((r) => (
                      <p key={r.region} className="text-corpo leading-5 text-[var(--atlas-texto-fraco)]">{r.region} · {r.leads} leads</p>
                    ))}
                  </>
                ) : <p className="text-corpo leading-5 text-[var(--atlas-texto-fraco)]">Sem quebra geográfica disponível.</p>}
              </div>
              <div>
                <p className="cc6-metric-label mb-2">Quem responde</p>
                {a.demo && a.demo.lines.length ? (
                  <>
                    {a.demo.lines.slice(0, 3).map((d, i) => (
                      <div key={`${d.age}-${d.gender}-${i}`} className="mb-2 flex items-baseline justify-between gap-2">
                        <span className="text-corpo text-[var(--atlas-texto-forte)]">{d.age} · {d.gender}</span>
                        <span className="cc6-num shrink-0 text-corpo text-[var(--atlas-texto-medio)]">{cpl(d.cpl)}</span>
                      </div>
                    ))}
                    <p className="mt-2 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">{a.demo.policyNote}</p>
                  </>
                ) : <p className="text-corpo leading-5 text-[var(--atlas-texto-fraco)]">Sem quebra demográfica disponível.</p>}
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
                      <span className="min-w-0 break-words text-corpo text-[var(--atlas-texto-forte)]">{line.angle}<span className="text-[var(--atlas-texto-fraco)]"> · {line.product}</span></span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="cc6-num text-corpo text-[var(--atlas-texto-medio)]">{cpl(line.cpl)}</span>
                        <span className="cc6-num text-rotulo text-[var(--atlas-texto-fraco)]">{line.leads} leads · {line.ads} peças</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-corpo leading-5 text-[var(--atlas-texto-fraco)]">
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
              <span className="text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">{pres.summary}</span>
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
                    <span className="min-w-0 break-words text-corpo font-medium text-[var(--atlas-texto-forte)]">{p.target}</span>
                    {targetId ? (
                      <button
                        type="button"
                        onClick={() => { void copyTargetId(targetId); }}
                        title="Copiar o id do anúncio para agir na plataforma — este botão não pausa nada"
 className="cc6-chip cc6-interativo cc6-num hover:text-[var(--atlas-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
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
                      {lastro ? <p className="text-corpo leading-5 text-[var(--atlas-texto-forte)]">{lastro}</p> : null}
                      {p.expectedEffect ? (
                        <p className="text-corpo leading-5 text-[var(--atlas-texto-medio)]">Efeito esperado: {p.expectedEffect}</p>
                      ) : null}
                      {why ? <p className="text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">{why}</p> : null}
                      {!lastro && !p.expectedEffect ? (
                        <p className="text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
                          Esta prescrição chegou sem número de lastro nem efeito esperado — trate como sinal a investigar, não como recomendação.
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            {pres.proposals.length > shown.length ? (
              <p className="cc6-num px-5 pt-2 text-rotulo text-[var(--atlas-texto-fraco)]">+{pres.proposals.length - shown.length} prescrições nesta janela</p>
            ) : null}
            <p className="cc6-num px-5 pb-4 pt-2 text-micro uppercase tracking-[.1em] text-[var(--atlas-texto-fraco)]">
              proposta · nada é pausado, consolidado ou publicado automaticamente
            </p>
          </section>
        );
      })()}

      {/* FERRAMENTA DEPOIS DA FILA — esta seção era a PRIMEIRA de "Agir".
          Ela não decide nada: ela cria. Quem abre a etapa vem responder ao que
          a IA propôs (movimentos e prescrições, logo acima), e encontrava um
          formulário de captação na frente das duas filas.

          Continua dentro de `report ?` de propósito: sem relatório de custos o
          usuário não é gestor (a rota devolve 403 e o GateCard explica), e
          publicar campanha não pode nascer de um portão diferente do que
          governa o resto da etapa. Nenhum campo, botão ou texto mudou. */}
      {report ? (
        <section aria-label="Subir campanha completa na Meta" hidden={foraDaEtapa("agir")} className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "320ms" }}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pb-3 pt-4">
            <h3 className="cc6-eyebrow">Subir campanha completa</h3>
            <p className="min-w-0 flex-1 text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
              Agência · publicação — copy por ângulo, política conferida, mídia enviada e a estrutura
              inteira montada: campanha, conjunto, criativo e um anúncio para cada ângulo. Tudo nasce pausado.
            </p>
          </div>
          <div className="px-5 pb-5">
            <CampaignIntakePanel empreendimentos={["Inside Perdizes", "Spin Mood", "Arvo Teixeira da Silva", "Tiê Aclimação"]} />
          </div>
        </section>
      ) : null}

      {/* Transparência: como as IAs decidem — linha discreta expansível. */}
      {calibration.status === "ok" && calibration.data.summary.length > 0 ? (
        <details className="cc6-panel-quiet cc6-reveal px-4 py-3">
          <summary className="cc6-eyebrow cursor-pointer list-none select-none">como as IAs decidem ▸</summary>
          <ul className="mt-2 space-y-1">
            {calibration.data.summary.map((line) => (
              <li key={line} className="text-corpo leading-5 text-[var(--atlas-texto-medio)]">{line}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {/* Carimbo de frescor — AUDITORIA, e por isso o rodapé.
          Ele morava acima da dobra, num bloco de primeiro nível só para ele.
          Hora da última leitura e cadência de refresh não fazem ninguém agir:
          dizem se o que está na tela ainda vale. Continua `aria-live` e
          continua atualizando a cada 60s; só parou de ocupar a faixa que a
          verba precisa.
          Sem `cc6-num`: no tema claro ele repintaria este texto de âmbar por
          cima do utilitário, e âmbar aqui diria "atenção" sem haver nenhuma. */}
      {updatedAt ? (
        <p className="text-rotulo tabular-nums text-[var(--atlas-texto-fraco)]" aria-live="polite">
          atualizado {clock.format(updatedAt)} · refresh 60s
        </p>
      ) : null}

      {/* (f) Satélites em uma linha discreta. */}
      <nav aria-label="Módulos satélites" hidden={foraDaEtapa("agir")} className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="cc6-eyebrow mr-1.5">Módulos</span>
        {SATELLITES.map((satellite) => (
          <Link
            key={satellite.href}
            href={satellite.href}
 className="cc6-chip cc6-interativo hover:text-[var(--atlas-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
          >
            {satellite.label} →
          </Link>
        ))}
      </nav>
    </div>
  );
}
