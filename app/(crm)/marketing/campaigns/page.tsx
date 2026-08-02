"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasEmpty, AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import {
  AUTO_REGISTERED_CAMPAIGN_STATUS_LABEL,
  AUTO_REGISTERED_CAMPAIGN_STATUS_TITLE,
  isAutoRegisteredCampaign,
} from "@/lib/marketing/campaign-provenance";

// Qualidade por campanha — consome /api/v1/analytics/campaign-quality
// (gestor+; tabelas vivas: marketing_campaigns, leads, lead_events,
// marketing_spend). Shape em lib/atlas/campaign-quality.ts.

type QualityRow = {
  id: string;
  name: string;
  platform: string;
  status: string;
  leads: number;
  qualifiedLeads: number;
  // Taxas e custos são null sem amostra suficiente (o gate mora em
  // buildCampaignQuality, não aqui): a tela não pode estampar "33,3%" no mesmo
  // pixel em que declara AMOSTRA INSUFICIENTE. Contagem é fato e aparece sempre.
  qualificationRate: number | null;
  // ── AS DUAS QUALIFICAÇÕES CHEGAVAM E SÓ UMA APARECIA ─────────────────────
  // A rota publica os dois eixos lado a lado e diz por quê: "consumidor nenhum
  // deve ler 'qualificado' sem saber qual das duas está olhando". O eixo
  // COMERCIAL (etapa canônica em visita/proposta/contrato/ganho) vinha na
  // resposta e a tela descartava — e ele é o único dos dois que divide pela
  // MESMA base do descarte (leads), portanto o único comparável com ele.
  qualificationBaseLeads?: number;
  commercialQualifiedLeads?: number;
  commercialQualificationRate?: number | null;
  costPerCommercialQualifiedLead?: number | null;
  avgScore: number | null;
  sales: number;
  conversionRate: number | null;
  discarded: number;
  discardRate: number | null;
  discardsByMetaCategory: Array<{ category: string; count: number }>;
  topDiscardReason: { key: string; label: string; count: number } | null;
  spend: number;
  costPerLead: number | null;
  costPerQualifiedLead: number | null;
  qualityGrade: "A" | "B" | "C" | null;
  // A régua que produziu ESTA nota. `policy.qualityGradeVersion` já aparecia na
  // camada de método, mas a versão viaja também por linha — e nota produzida por
  // régua diferente não é comparável com a da linha de cima. Vai para o title do
  // chip: custo zero de pixel, e a auditoria fica onde se audita.
  qualityGradeRuleVersion?: number;
  // Maturidade observável da campanha: a data da lead mais antiga do bucket. Uma
  // campanha com 40 leads acumuladas em 90 dias e outra com 40 em 3 dias não
  // pedem a mesma decisão de verba, e até aqui a tela mostrava as duas iguais.
  oldestLeadAt?: string | null;
  sampleSufficient: boolean;
  explanation?: string | null;
};

/**
 * Prontidão da aquisição — se a verba de hoje traz lead amanhã.
 *
 * ── POR QUE ESTE BLOCO EXISTE NESTA TELA ────────────────────────────────────
 * `readiness` já viajava na resposta de /campaign-quality (a rota busca a Graph
 * e paga o round-trip a cada carga) e esta página jogava fora. O docstring de
 * lib/meta/marketing/campaign-readiness.ts descreve, palavra por palavra, o
 * defeito que isso causa — e descreve ESTA tela: "o painel mostra CPL '—' com o
 * subtexto 'Custo não medido', que é indistinguível de 'ainda não gastamos'".
 * Sem prontidão, um CPL omitido lê-se como "ainda não investimos" quando o fato
 * pode ser "o teto da conta está esgotado e nenhuma lead vai entrar amanhã".
 *
 * `medido: false` é estado de primeira classe: leitura que falhou aparece como
 * NÃO MEDIDO com o motivo, nunca some e nunca fica verde.
 */
type ReadinessBlocker = {
  codigo: string;
  gravidade: "critical" | "attention";
  resumo: string;
  acao: string;
};
type Readiness =
  | { medido: false; motivo: string; lidoEm: string }
  | {
      medido: true;
      lidoEm: string;
      conta?: { id: string; nome: string | null; ativa: boolean };
      verba: { tetoBrl: number | null; gastoBrl: number | null; restanteBrl: number | null; esgotado: boolean };
      campanhas: { total: number; ativas: number };
      anunciosAtivos: number;
      bloqueios: ReadinessBlocker[];
    };

type Payload = {
  period: { start: string; end: string; days: number };
  readiness?: Readiness;
  totals: {
    campaigns: number;
    campaignsRanked: number;
    leads: number;
    qualified: number;
    // Segundo eixo, no nível dos TOTAIS. O eixo comercial já tinha sido
    // resgatado linha a linha no ranking, mas o número HERÓI da tela continuava
    // sendo só o proxy de cadastro — o degrau de 34px, que a régua reserva para
    // "o único número da tela que decide", estava ocupado por uma aproximação
    // sem que o eixo com evidência de funil aparecesse ao lado dele.
    commercialQualified?: number;
    sales: number;
    discarded: number;
    classifiedDiscards: number;
    unattributedDiscards: number;
    spend: number;
    // ── O CPL DA ORGANIZAÇÃO NÃO É `spend / leads` ──────────────────────────
    //
    // Esta tela dividia o gasto TOTAL pelas leads TOTAIS. lib/atlas/campaign-
    // quality.ts descreve, com data, o que essa conta produziu: enquanto
    // `marketing_spend` estava vazia ela imprimia "—" e ninguém viu o defeito;
    // no dia em que o importador gravou R$ 3.612,01 a MESMA conta passou a
    // estampar CPL R$ 9 sobre 406 leads das quais ZERO vieram das campanhas que
    // gastaram esse dinheiro — elas são de outra conta de anúncios.
    //
    // A fonte de verdade já publicava o CPL calculado só sobre campanhas que
    // têm as DUAS PONTAS (gasto e lead) e, separado, o dinheiro que ficou de
    // fora. A tela ignorava os dois e refazia a divisão proibida à mão: dois
    // caminhos para o mesmo número, e o caminho errado era o que aparecia.
    //
    // Opcionais de propósito: campo ausente é "não publicado" e vira traço com
    // frase — nunca cai de volta na divisão local, que é o defeito de origem.
    costPerLead?: number | null;
    costPerQualifiedLead?: number | null;
    /** Gasto de campanhas que não trouxeram nenhuma lead a este CRM. */
    spendWithoutLeads?: number;
    campaignsSpendWithoutLeads?: number;
    /** Frase pronta da fonte quando havia gasto e o CPL não tem base. */
    whyNoCostPerLead?: string | null;
  };
  ranking: QualityRow[];
  policy: {
    minimumLeadsForDecision: number;
    qualifiedDefinition: string;
    qualityGradeRule: Record<string, string>;
    qualityGradeVersion?: string;
    spendMeasured: boolean;
    // Três estados, não dois: a tela colapsava tudo em "custos off" e assim
    // dizia a mesma frase para "a tabela está legível e não tem lançamento
    // nesta janela" e para "a leitura falhou". São fatos diferentes e levam a
    // ações diferentes — a rota publica a distinção e o painel agora respeita.
    spendCoverage?: "medido" | "sem_lancamento" | "indisponivel";
    spendCoverageMeaning?: string;
    windowComplete?: boolean;
  };
};

// Conselheiro Andromeda — consome /api/v1/ai/andromeda-advisor (gestor+;
// só agregados, zero PII; nada é aplicado automaticamente na Meta).
// Shape em lib/ai/andromeda-pipeline-advisor.ts.
type AdvisorRecommendation = {
  campaignId: string;
  campaignName: string;
  // scale_por_proxy: escalada apoiada em qualificação de CADASTRO porque ainda
  // não há amostra de venda — rótulo próprio para não passar por escalada com
  // lastro de conversão.
  //
  // investigate_attribution ESTAVA FALTANDO AQUI. Ele é emitido por
  // attributionGapRecommendation (gasto lançado na janela e ZERO lead atribuído
  // no CRM) e consta de ANDROMEDA_ADVISOR_ACTIONS, mas o union local não o
  // listava: `advisorActionLabels[rec.action]` devolvia undefined e a
  // recomendação mais cara do produto — a que aponta dinheiro queimando sem
  // lead atribuído — renderizava como uma pílula EM BRANCO, com
  // `class="… undefined"`. TypeScript não pegou porque o payload entra por
  // `json.data as AdvisorPayload`: a asserção calou o compilador.
  action:
    | "scale"
    | "scale_por_proxy"
    | "adjust_targeting"
    | "fix_form"
    | "pause_review"
    | "investigate_attribution"
    | "keep";
  rationale: string;
  confidence: "alta" | "media" | "baixa";
  metaFeedbackHint: string;
};

type AdvisorPayload = {
  engine: "generative" | "deterministic";
  model: string | null;
  recommendations: AdvisorRecommendation[];
  humanApprovalRequired: boolean;
};

// Analista Andromeda — consome /api/v1/ai/campaign-analyst (gestor+; só
// agregados, zero PII). O Analista NARRA (anomalias entre janelas + narrativa
// executiva); o Conselheiro RECOMENDA — papéis distintos, sem competição.
// Shape em lib/ai/campaign-analyst.ts.
type AnalystAnomaly = {
  campaignId: string;
  campaignName: string;
  kind: "qualification_rate" | "discard_category_share" | "cost_per_lead" | "lead_volume";
  direction: "up" | "down";
  magnitude: number;
  evidence: string;
};

type AnalystPayload = {
  narrative: string;
  engine: "generative" | "deterministic";
  anomalies: AnalystAnomaly[];
  period: {
    current: { start: string; end: string; days: number };
    previous: { start: string; end: string; days: number };
  };
  windowComplete: boolean;
};

const analystKindLabels: Record<AnalystAnomaly["kind"], string> = {
  qualification_rate: "Qualificação",
  discard_category_share: "Descarte",
  cost_per_lead: "CPL",
  lead_volume: "Volume",
};

// Tom semântico do chip: piora (queda de qualidade, salto de descarte, CPL
// subindo, volume caindo) = warning/danger; melhora = success.
const analystAnomalyTone = (anomaly: AnalystAnomaly): "success" | "warning" | "danger" => {
  if (anomaly.kind === "qualification_rate") return anomaly.direction === "down" ? "danger" : "success";
  if (anomaly.kind === "discard_category_share") return "warning";
  if (anomaly.kind === "cost_per_lead") return anomaly.direction === "up" ? "warning" : "success";
  return "danger"; // lead_volume só existe como queda >= 50%
};

const analystAnomalyDelta = (anomaly: AnalystAnomaly) => {
  const sign = anomaly.direction === "up" ? "+" : "−";
  const unit = anomaly.kind === "qualification_rate" || anomaly.kind === "discard_category_share"
    ? " p.p."
    : "%";
  return `${sign}${anomaly.magnitude}${unit}`;
};

const advisorActionLabels: Record<AdvisorRecommendation["action"], string> = {
  scale: "ESCALAR VERBA",
  scale_por_proxy: "ESCALAR SEM AMOSTRA DE VENDA",
  adjust_targeting: "AJUSTAR PÚBLICO",
  fix_form: "CORRIGIR FORMULÁRIO",
  pause_review: "REVISAR / PAUSAR",
  investigate_attribution: "INVESTIGAR ATRIBUIÇÃO",
  keep: "MANTER",
};

/**
 * Ordem de leitura da fila de decisão do diretor.
 *
 * A rota devolve as recomendações na ordem do ranking (qualidade), que é a
 * ordem de quem INFORMA. Quem DECIDE lê por consequência: primeiro o que está
 * queimando dinheiro sem lead atribuído, depois o que precisa parar, e só então
 * o que merece mais verba. "MANTER" fecha a fila — é a ausência de decisão.
 *
 * Nenhuma recomendação é escondida ou agrupada: só a ORDEM muda.
 */
const advisorActionWeight: Record<AdvisorRecommendation["action"], number> = {
  investigate_attribution: 0,
  pause_review: 1,
  scale: 2,
  fix_form: 3,
  adjust_targeting: 4,
  scale_por_proxy: 5,
  keep: 6,
};

const advisorConfidenceLabels: Record<AdvisorRecommendation["confidence"], string> = {
  alta: "alta",
  media: "média",
  baixa: "baixa",
};
const advisorConfidenceWeight: Record<AdvisorRecommendation["confidence"], number> = {
  alta: 0,
  media: 1,
  baixa: 2,
};

const metaCategoryLabels: Record<string, string> = {
  duplicate: "Duplicado",
  invalid_contact_info: "Contato inválido",
  unreachable: "Inalcançável",
  not_interested: "Sem interesse",
  out_of_service_area: "Fora da área",
  budget_mismatch: "Orçamento",
  not_qualified: "Crédito negado",
  wrong_product: "Produto",
  purchased_from_competitor: "Concorrente",
  spam: "Spam",
  other: "Outro",
};

const brl = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);

// Texto do "—": a rota já manda por que a taxa/custo foi omitido; quando não
// mandar, a tela diz a regra em vez de deixar o traço mudo.
const omission = (row: QualityRow) =>
  row.explanation
  ?? `Amostra insuficiente (${row.leads} lead(s)) — taxa e custo omitidos. A contagem continua sendo fato observado.`;

/* ===== Vocabulário desta central =====

   Esta constante já foi uma RECEITA escrita à mão — raio, hairline e gradiente
   copiados, caractere por caractere, do que a primitiva do produto declarava.
   Cópia de receita é a forma que uma divergência toma antes de virar defeito:
   quando o tema claro ganhou tratamento na primitiva, estes painéis teriam
   continuado escuros sozinhos, porque nenhuma correção feita lá alcançava a
   cópia daqui. Hoje aponta para a primitiva, e por isso a lista de valores
   literais que descrevia a receita saiu junto — descrever a cor em prosa é
   convidar a próxima pessoa a cravá-la de novo. Cor sai de token. ===== */
const cc5Panel = "cc6-panel";
/* O hover também mora na primitiva agora. */
const cc5PanelHover = "";
/* ── CAIXA DENTRO DE CAIXA ────────────────────────────────────────────────
   `cc5Inner` era outra receita à mão (`rounded-xl border border-hairline
   bg-white/[.02]`) e cobrava dois preços. O primeiro: por ser utilitário e não
   a primitiva, a regra `.cc6-panel .cc6-panel-quiet { border-color: transparent }`
   — que existe justamente para matar filete dentro de filete — não a alcançava,
   então cada bloco aninhado redesenhava, 1px adiante, a MESMA hairline que o
   painel-pai já tinha desenhado. O segundo: `bg-white/[.02]` é branco sobre
   branco no tema claro, ou seja, o aninhamento simplesmente sumia de dia.
   A primitiva resolve os dois. */
const cc5Inner = "cc6-panel-quiet";
const cc5Eyebrow = "font-mono text-micro font-semibold uppercase tracking-[.18em] text-[var(--atlas-texto-fraco)]";
const cc5Focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";
const cc5Chip =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-micro font-semibold uppercase tracking-[.12em] tabular-nums";

/* Hairline única desta tela — mesma tinta da primitiva, expressa por token para
   virar com o tema. Um valor, um lugar. */
const hairline = "border-[color-mix(in_srgb,var(--atlas-texto-fraco)_28%,transparent)]";

const chipTone = {
  neutral: "border-[color-mix(in_srgb,var(--atlas-texto-fraco)_32%,transparent)] text-[var(--atlas-texto-medio)]",
  accent: "border-[color-mix(in_srgb,var(--atlas-accent)_45%,transparent)] text-[var(--atlas-accent)]",
  emerald: "border-[color-mix(in_srgb,var(--atlas-estado-sucesso)_38%,transparent)] text-[var(--atlas-estado-sucesso)]",
  amber: "border-[color-mix(in_srgb,var(--atlas-estado-atencao)_38%,transparent)] text-[var(--atlas-estado-atencao)]",
  rose: "border-[color-mix(in_srgb,var(--atlas-estado-perigo)_38%,transparent)] text-[var(--atlas-estado-perigo)]",
} as const;
type ChipToneKey = keyof typeof chipTone;

const semanticInk: Record<"success" | "warning" | "danger", string> = {
  success: "text-[var(--atlas-estado-sucesso)]",
  warning: "text-[var(--atlas-estado-atencao)]",
  danger: "text-[var(--atlas-estado-perigo)]",
};
const semanticChip: Record<"success" | "warning" | "danger", string> = {
  success: chipTone.emerald,
  warning: chipTone.amber,
  danger: chipTone.rose,
};

const advisorActionChips: Record<AdvisorRecommendation["action"], ChipToneKey> = {
  scale: "emerald",
  scale_por_proxy: "amber", // âmbar: proposta válida, lastro parcial
  adjust_targeting: "accent",
  fix_form: "amber",
  pause_review: "rose",
  investigate_attribution: "rose", // gasto lançado com zero lead atribuído
  keep: "neutral",
};
// A faixa de severidade à esquerda da linha repete o tom do chip por GEOMETRIA,
// para o peso da decisão ser legível antes de qualquer palavra ser lida.
const advisorActionBand: Record<AdvisorRecommendation["action"], string> = {
  scale: "var(--atlas-estado-sucesso)",
  scale_por_proxy: "var(--atlas-estado-atencao)",
  adjust_targeting: "var(--atlas-accent)",
  fix_form: "var(--atlas-estado-atencao)",
  pause_review: "var(--atlas-estado-perigo)",
  investigate_attribution: "var(--atlas-estado-perigo)",
  keep: "color-mix(in srgb, var(--atlas-texto-fraco) 55%, transparent)",
};

const gradeChips: Record<NonNullable<QualityRow["qualityGrade"]>, ChipToneKey> = {
  A: "emerald",
  B: "accent",
  C: "amber",
};

// period.start/end chegam como ISO UTC — fatiar evita deslocar o dia por fuso.
const isoDay = (value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}`;

/* ── O GRÁFICO ────────────────────────────────────────────────────────────
   Duas barras, e as duas respondem perguntas que a coluna de números não
   responde de relance:

   1. VOLUME — "quanto do meu volume está concentrado em qual campanha?" Ler
      dez inteiros e comparar de cabeça é o que a tabela pedia; a barra mostra
      a concentração num olhar. Base única: a maior campanha da janela.

   2. MISTURA DE DESCARTE — "esta campanha morre por contato inválido ou por
      falta de interesse?" A tela mostrava só as TRÊS primeiras categorias em
      chips e descartava o resto; a barra mostra a composição INTEIRA, e cada
      fatia carrega label + contagem no <title>.

   Por que NÃO existe aqui a barra empilhada "qualificado / descartado /
   restante", que seria a mais óbvia: ela seria número inventado. Em
   buildCampaignQuality, `qualified` conta LEADS com eixo de cadastro medido e
   `discarded` conta EVENTOS de descarte — um mesmo lead pode entrar nos dois, e
   um descarte pode referenciar lead de fora da janela. Os dois não particionam
   `leads`, então empilhá-los desenharia uma soma que não existe. Já
   `discardsByMetaCategory` É partição exata de `discarded` (cada evento cai em
   uma categoria, com "other" de default), e por isso pode ser empilhada.

   SVG à mão, no mesmo padrão que /marketing já usa (viewBox unitário +
   preserveAspectRatio="none" + fill por color-mix de token). Zero canvas:
   `fillStyle` não resolve `var(--token)` e quebraria em silêncio. */
const discardShade = (index: number) =>
  `color-mix(in srgb, var(--atlas-estado-perigo) ${Math.max(40, 92 - index * 13)}%, transparent)`;

function BarraDeVolume({ leads, maxLeads }: { leads: number; maxLeads: number }) {
  if (maxLeads <= 0) return null;
  const share = Math.min(100, Math.max(0, (leads / maxLeads) * 100));
  return (
    <svg
      viewBox="0 0 100 3"
      preserveAspectRatio="none"
      className="ml-auto mt-1.5 block h-[3px] w-20"
      role="img"
      aria-label={`${leads} leads — ${share.toFixed(0)}% do volume da maior campanha da janela`}
    >
      <rect x="0" y="0" width="100" height="3" rx="0.6" fill="color-mix(in srgb, var(--atlas-texto-fraco) 24%, transparent)" />
      <rect x="0" y="0" width={share} height="3" rx="0.6" fill="color-mix(in srgb, var(--atlas-accent) 78%, transparent)" />
    </svg>
  );
}

function BarraDeDescarte({ mix, total }: { mix: QualityRow["discardsByMetaCategory"]; total: number }) {
  if (!mix.length || total <= 0) return null;
  // As faixas precisam saber onde cada uma COMEÇA, e isso é uma soma corrida.
  // Fazê-la com `offset += width` dentro do `.map()` reprova no React Compiler
  // ("Cannot reassign after render completes") — e a reprovação é justa: o
  // callback do map vira uma função que o compilador pode memoizar e reexecutar
  // fora de ordem, e uma soma corrida depende da ordem. Calculada ANTES, com
  // reduce, ela é um dado; calculada DENTRO, é um efeito colateral disfarçado.
  const inicios: number[] = [];
  for (let i = 0, acumulado = 0; i < mix.length; i += 1) {
    inicios.push(acumulado);
    acumulado += (mix[i].count / total) * 100;
  }
  return (
    <svg
      viewBox="0 0 100 4"
      preserveAspectRatio="none"
      className="ml-auto mt-1.5 block h-1 w-24"
      role="img"
      aria-label={`Composição dos ${total} descartes: ${mix
        .map((item) => `${metaCategoryLabels[item.category] ?? item.category} ${item.count}`)
        .join(", ")}`}
    >
      {mix.map((item, index) => {
        const width = (item.count / total) * 100;
        const x = inicios[index];
        return (
          <rect key={item.category} x={x} y="0" width={Math.max(0, width - 0.4)} height="4" rx="0.6" fill={discardShade(index)}>
            <title>{`${metaCategoryLabels[item.category] ?? item.category} · ${item.count}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

// Indicador da janela: barra fina de tom (geometria), eyebrow mono, número mono
// tabular e micro-tendência textual vinda do Analista (quando houver dado).
// Vive dentro de UM painel compartilhado — quatro painéis com quatro hairlines
// para quatro números era filete fazendo o trabalho que o espaço já fazia.
function Indicador({
  eyebrow,
  explain,
  value,
  valueClass = "text-[var(--atlas-texto-forte)]",
  detail,
  trend,
  barClass,
  heroi = false,
}: {
  eyebrow: string;
  explain: string;
  value: string;
  valueClass?: string;
  detail: string;
  trend: ReactNode;
  barClass: string;
  heroi?: boolean;
}) {
  return (
    <article className="min-w-0 px-5 py-4">
      <span aria-hidden="true" className={`block h-[2px] w-8 rounded-full ${barClass}`} />
      <p className={`${cc5Eyebrow} mt-2.5`} title={explain}>
        {eyebrow}
      </p>
      {/* `cc6-num` dá face e tabular-nums SEM cravar `color` — a irmã
          `cc6-metric-value` crava, e como ela é declarada sem camada enquanto
          utilitário do Tailwind vive em `@layer utilities`, um
          `text-[var(--atlas-estado-perigo)]` ali seria classe morta: apareceria
          no código e não na tela. O vermelho do descarte crítico depende disso. */}
      <p
        className={`cc6-num mt-1.5 font-semibold leading-none tracking-tight ${heroi ? "text-3xl sm:text-heroi" : "text-numero"} ${valueClass}`}
      >
        {value}
      </p>
      <p className="mt-2 font-mono text-rotulo leading-4 tabular-nums text-[var(--atlas-texto-medio)]">{detail}</p>
      {trend}
    </article>
  );
}

export default function CampaignsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [advisor, setAdvisor] = useState<AdvisorPayload | null>(null);
  const [advisorError, setAdvisorError] = useState("");
  const [advisorLoading, setAdvisorLoading] = useState(true);
  const [analyst, setAnalyst] = useState<AnalystPayload | null>(null);
  const [analystError, setAnalystError] = useState("");
  const [analystLoading, setAnalystLoading] = useState(true);
  const [analystAgeSeconds, setAnalystAgeSeconds] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        const response = await fetch(`/api/v1/analytics/campaign-quality?days=${days}`, {
          cache: "no-store",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json?.error?.message || "Painel indisponível");
        if (active) setData(json.data as Payload);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Painel indisponível");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [days, reloadKey]);

  useEffect(() => {
    let active = true;
    (async () => {
      setAdvisorLoading(true);
      setAdvisorError("");
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        const response = await fetch(`/api/v1/ai/andromeda-advisor?days=${days}`, {
          cache: "no-store",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json?.error?.message || "Conselheiro indisponível");
        if (active) setAdvisor(json.data as AdvisorPayload);
      } catch (reason) {
        if (active) setAdvisorError(reason instanceof Error ? reason.message : "Conselheiro indisponível");
      } finally {
        if (active) setAdvisorLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [days, reloadKey]);

  useEffect(() => {
    let active = true;
    (async () => {
      setAnalystLoading(true);
      setAnalystError("");
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        const response = await fetch(`/api/v1/ai/campaign-analyst?days=${days}`, {
          cache: "no-store",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json?.error?.message || "Analista indisponível");
        if (active) setAnalyst(json.data as AnalystPayload);
      } catch (reason) {
        if (active) setAnalystError(reason instanceof Error ? reason.message : "Analista indisponível");
      } finally {
        if (active) setAnalystLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [days, reloadKey]);

  // "atualizado há Xs" — zera a cada nova resposta do analista.
  useEffect(() => {
    if (!analyst) return;
    setAnalystAgeSeconds(0);
    const timer = setInterval(() => setAnalystAgeSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [analyst]);

  const totals = data?.totals;
  const ranking = useMemo(() => data?.ranking ?? [], [data]);
  const minimum = data?.policy.minimumLeadsForDecision ?? 30;
  const insufficient = ranking.filter((row) => !row.sampleSufficient).length;
  const maxLeads = useMemo(() => ranking.reduce((peak, row) => Math.max(peak, row.leads), 0), [ranking]);

  // Derivações puramente visuais (mesmas contas que a versão anterior exibia).
  const discardCritical = totals ? totals.leads > 0 && totals.discarded / totals.leads > 0.25 : false;

  /* ── A VERBA QUE JÁ SAIU E NÃO TROUXE LEAD ────────────────────────────────
     `spendWithoutLeads` viajava na resposta desde que o CPL da organização foi
     consertado na fonte, e esta tela jogava fora. Pela régua ele não é detalhe
     de custo: é DECISÃO — dinheiro que saiu do caixa e não produziu uma linha
     no CRM. É a informação mais cara da carga e estava em zero pixel, enquanto
     um CPL sem base ocupava um indicador inteiro.

     Sobe para o painel de prontidão porque é a mesma pergunta pelo outro lado:
     lá se pergunta se a verba vai trazer lead amanhã; aqui, se a verba de
     ontem trouxe. */
  const verbaSemRetorno =
    totals && typeof totals.spendWithoutLeads === "number" && totals.spendWithoutLeads > 0
      ? {
          valor: totals.spendWithoutLeads,
          campanhas: totals.campaignsSpendWithoutLeads ?? 0,
          // Só existe quando NENHUMA campanha com gasto trouxe lead — aí o CPL
          // inteiro fica sem base e a fonte manda a frase pronta.
          frase: totals.whyNoCostPerLead ?? null,
        }
      : null;

  /* CPL da organização: valor publicado ou traço. Nunca `spend / leads`.
     `undefined` (rota antiga) e `null` (sem base) são estados distintos e as
     duas frases dizem coisas diferentes — colapsá-las repetiria, um degrau
     acima, o mesmo erro de tratar ausência como zero. */
  const cplOrg = totals && "costPerLead" in totals ? totals.costPerLead ?? null : undefined;
  const cplQualificada = totals && "costPerQualifiedLead" in totals ? totals.costPerQualifiedLead ?? null : undefined;

  // A fila de decisão do diretor, ordenada por consequência (ver
  // advisorActionWeight). Ordenação estável: dentro do mesmo peso e da mesma
  // confiança, a ordem da rota é preservada.
  const decisoes = useMemo(() => {
    const list = advisor?.recommendations ?? [];
    return [...list].sort(
      (left, right) =>
        (advisorActionWeight[left.action] ?? 9) - (advisorActionWeight[right.action] ?? 9)
        || (advisorConfidenceWeight[left.confidence] ?? 9) - (advisorConfidenceWeight[right.confidence] ?? 9),
    );
  }, [advisor]);
  const decisoesQuePedemAcao = decisoes.filter((rec) => rec.action !== "keep").length;

  // Prontidão: bloqueio crítico antes de bloqueio de atenção.
  const readiness = data?.readiness;
  const bloqueios = useMemo(() => {
    if (!readiness?.medido) return [];
    return [...readiness.bloqueios].sort(
      (left, right) => (left.gravidade === "critical" ? 0 : 1) - (right.gravidade === "critical" ? 0 : 1),
    );
  }, [readiness]);

  // Estado honesto da comunicação com a Meta para a faixa de comando.
  const metaState = error
    ? { dot: "bg-[var(--atlas-estado-perigo)]", chip: chipTone.rose, label: "FALHA NA LEITURA" }
    : loading
      ? { dot: "bg-[var(--atlas-texto-fraco)] motion-safe:animate-pulse", chip: chipTone.neutral, label: "SINCRONIZANDO…" }
      : data?.policy.windowComplete === false
        ? { dot: "bg-[var(--atlas-estado-atencao)]", chip: chipTone.amber, label: "PISO — JANELA TRUNCADA" }
        : data
          ? { dot: "bg-[var(--atlas-estado-sucesso)]", chip: chipTone.emerald, label: "DADO COMPLETO" }
          : { dot: "bg-[var(--atlas-texto-fraco)]", chip: chipTone.neutral, label: "AGUARDANDO" };

  // Cobertura do gasto nos três estados que a rota publica. Sem o terceiro, a
  // tela dizia a mesma frase para "não houve lançamento" e para "a leitura
  // falhou" — e essas duas pedem ações diferentes do diretor.
  const spendCoverage = data
    ? data.policy.spendCoverage ?? (data.policy.spendMeasured ? "medido" : "indisponivel")
    : null;
  const spendGap =
    spendCoverage === "sem_lancamento"
      ? {
          chip: "SEM LANÇAMENTO NA JANELA · CPL OMITIDO",
          tone: chipTone.neutral,
          frase:
            "marketing_spend está legível e não tem linha nesta janela — o que NÃO é o mesmo que não ter gastado. CPL omitido em vez de fingir zero.",
        }
      : spendCoverage === "indisponivel"
        ? {
            chip: "LEITURA DE GASTO FALHOU · CPL OMITIDO",
            tone: chipTone.amber,
            frase:
              "A leitura de marketing_spend falhou nesta janela — CPL omitido em vez de fingir zero. Zero pareceria saudável; o traço diz a verdade.",
          }
        : null;

  // Micro-tendência textual dos indicadores: anomalias reais do Analista
  // (janela atual vs anterior de mesmo tamanho) — nunca tendência inventada.
  const trendLine = (kind: AnalystAnomaly["kind"]): ReactNode => {
    if (!analyst) return null;
    const floorSuffix = analyst.windowComplete ? "" : " · piso";
    const anomaly = analyst.anomalies.find((item) => item.kind === kind) ?? null;
    if (!anomaly) {
      return (
        <p
          className="mt-1.5 font-mono text-micro leading-4 tabular-nums text-[var(--atlas-texto-fraco)]"
          title={`Comparação com ${isoDay(analyst.period.previous.start)} → ${isoDay(analyst.period.previous.end)}`}
        >
          sem anomalia vs janela anterior{floorSuffix}
        </p>
      );
    }
    // Sem `truncate`: o nome da campanha É a informação da linha, e frase
    // cortada com reticências não é frase legível. Quebra em duas linhas.
    return (
      <p
        className={`mt-1.5 font-mono text-micro leading-4 tabular-nums ${semanticInk[analystAnomalyTone(anomaly)]}`}
        title={anomaly.evidence}
      >
        {anomaly.direction === "up" ? "▲" : "▼"} {analystAnomalyDelta(anomaly)} · {anomaly.campaignName}
        {floorSuffix}
      </p>
    );
  };

  return (
    <div className="space-y-4 pb-10" data-phase="campaign-quality">
      {/* ═══ 1 · FAIXA DE COMANDO ═══════════════════════════════════════════
             Eram DOIS painéis empilhados dizendo coisas correlatas: um strip de
             estado da Meta e um cabeçalho com título, parágrafo de três linhas e
             três chips de política sob um filete. Juntos custavam ~270px da
             primeira dobra para zero decisão. Viraram um painel só: identidade,
             janela, estado e controles na mesma linha; a explicação de método e
             os chips de política descem para a camada recolhível — continuam a
             um clique, deixam de cobrar a dobra de quem já sabe o que a tela é.
             ══════════════════════════════════════════════════════════════ */}
      <section
        aria-label="Central de campanhas — janela e estado do dado"
        className={`cc5-reveal ${cc5Panel}`}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className={cc5Eyebrow}>MARKETING · CENTRAL DE CAMPANHAS</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-[var(--atlas-texto-forte)] sm:text-2xl">
              Qualidade por campanha
            </h1>
          </div>
          <p className="font-mono text-rotulo font-semibold uppercase tracking-[.14em] text-[var(--atlas-texto-medio)]">
            META · <span className="tabular-nums">{data?.period.days ?? days}</span> DIAS
          </p>
          {data ? (
            <p className="font-mono text-micro tabular-nums text-[var(--atlas-texto-fraco)]" title="Janela analisada (UTC)">
              {isoDay(data.period.start)} → {isoDay(data.period.end)}
            </p>
          ) : null}
          <p role="status" aria-live="polite" className={`${cc5Chip} ${metaState.chip}`}>
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${metaState.dot}`} />
            {metaState.label}
          </p>
          {spendGap ? (
            <p className={`${cc5Chip} ${spendGap.tone}`} title={spendGap.frase}>
              {spendGap.chip}
            </p>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            {/* Esta central MEDE campanha que já existe; não havia dela nenhum
                caminho para PROPOR uma nova. As duas propostas que a Sala de
                Comando sabe enviar são produtos cravados em ready-campaigns
                ("Arvo" e "Spin Mood") — os outros 2 dos 4 empreendimentos do
                banco não tinham porta nenhuma até /approvals (medido 02/08/2026). */}
            <Link
              href="/marketing/campanhas-criativos-proposta"
              className={`inline-flex min-h-11 items-center font-mono text-rotulo font-semibold uppercase tracking-[.14em] text-[var(--atlas-accent)] transition-colors hover:text-[var(--atlas-texto-forte)] ${cc5Focus}`}
            >
              Compor proposta →
            </Link>
            <Link
              href="/marketing/campaign-intelligence"
              className={`inline-flex min-h-11 items-center font-mono text-rotulo font-semibold uppercase tracking-[.14em] text-[var(--atlas-accent)] transition-colors hover:text-[var(--atlas-texto-forte)] ${cc5Focus}`}
            >
              Inteligência multicanal →
            </Link>
            <select
              aria-label="Período"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              className={`min-h-11 rounded-lg border ${hairline} bg-transparent px-3 font-mono text-rotulo font-semibold uppercase tracking-[.08em] tabular-nums text-[var(--atlas-texto-forte)] transition-colors hover:border-[var(--atlas-accent)] ${cc5Focus}`}
            >
              <option className="text-slate-900" value={7}>7 dias</option>
              <option className="text-slate-900" value={30}>30 dias</option>
              <option className="text-slate-900" value={90}>90 dias</option>
            </select>
            {/* `cc6-ghost-btn` já nasce com 44px de alvo; o botão anterior tinha
                32px — o menor alvo da tela era o único gesto dela. */}
            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
              disabled={loading}
              aria-label="Atualizar leitura da Meta e as análises"
              title="Atualizar leitura da Meta e as análises"
              className="cc6-ghost-btn w-11 font-mono text-sm disabled:cursor-wait disabled:opacity-60"
            >
              ↻
            </button>
          </div>
        </div>

        {/* Honestidade do dado — era um painel próprio com DUAS caixas aninhadas
            e um título; virou uma linha por limite declarado, no rodapé da
            faixa. A frase é a mesma, o filete a menos. Fica na primeira dobra
            de propósito: declarar limite é o que impede o número de mentir. */}
        {data && (data.policy.windowComplete === false || spendGap) ? (
          <div className={`cc6-hairline space-y-1.5 px-4 py-2.5 sm:px-5`}>
            {data.policy.windowComplete === false ? (
              <p className="text-corpo leading-5 text-[var(--atlas-texto-medio)]">
                <span className="font-mono text-micro font-semibold uppercase tracking-[.16em] text-[var(--atlas-estado-atencao)]">
                  Janela truncada
                </span>{" "}
                — teto de paginação atingido:{" "}
                <strong className="font-semibold text-[var(--atlas-texto-forte)]">números são piso, não total</strong>.
              </p>
            ) : null}
            {spendGap ? (
              <p className="text-corpo leading-5 text-[var(--atlas-texto-medio)]">
                <span className="font-mono text-micro font-semibold uppercase tracking-[.16em] text-[var(--atlas-estado-atencao)]">
                  Custo não medido
                </span>{" "}
                — {spendGap.frase}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Camada recolhível: método, política e definições. Tudo que estava no
            cabeçalho continua aqui, palavra por palavra, mais o que a rota já
            mandava e a tela não mostrava (definição de qualificação e versão da
            régua de nota — nota produzida por régua diferente não é comparável
            entre períodos). */}
        <details className="cc6-hairline group px-4 sm:px-5">
          <summary
            className={`flex min-h-11 cursor-pointer list-none items-center gap-2 font-mono text-micro font-semibold uppercase tracking-[.16em] text-[var(--atlas-texto-fraco)] transition-colors hover:text-[var(--atlas-texto-forte)] ${cc5Focus}`}
          >
            <span aria-hidden="true" className="transition-transform group-open:rotate-90">
              ›
            </span>
            Como esta central mede
          </summary>
          <div className="pb-4 pt-1">
            <p className="max-w-3xl text-corpo leading-6 text-[var(--atlas-texto-medio)]">
              Quais campanhas trazem leads que qualificam — e quais trazem leads que o time descarta.
              Nota A/B/C explicável, motivos de descarte na taxonomia Meta e custo por lead qualificado
              quando houver investimento lançado.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className={`${cc5Chip} ${chipTone.emerald}`}
                title="Conversão medida no CRM (vendas registradas), não no gerenciador de anúncios."
              >
                CRM é a verdade da conversão
              </span>
              <span
                className={`${cc5Chip} ${chipTone.accent}`}
                title={`Campanha só recebe nota de qualidade a partir de ${minimum} leads na janela.`}
              >
                Amostra mínima · {minimum} leads
              </span>
              <span
                className={`${cc5Chip} ${chipTone.neutral}`}
                title="Lê apenas tabelas vivas: marketing_campaigns, leads, lead_events, marketing_spend."
              >
                Só tabelas vivas
              </span>
              {data?.policy.qualityGradeVersion ? (
                <span
                  className={`${cc5Chip} ${chipTone.neutral}`}
                  title="Nota produzida por régua diferente não é comparável período a período — a versão viaja no payload."
                >
                  Régua da nota · {data.policy.qualityGradeVersion}
                </span>
              ) : null}
            </div>
            {data ? (
              <p className="mt-3 max-w-3xl font-mono text-micro leading-4 text-[var(--atlas-texto-fraco)]">
                Qualificação de cadastro = {data.policy.qualifiedDefinition} (proxy de cadastro, não é venda — a
                venda é confirmada no CRM). Qualificação comercial = etapa canônica em visita/proposta/contrato/ganho.
                {data.policy.spendCoverageMeaning ? ` Cobertura de gasto: ${data.policy.spendCoverageMeaning}.` : ""}
              </p>
            ) : null}
          </div>
        </details>
      </section>

      {/* Erro nunca vira tela vazia: motivo recebido da API + retry visíveis. */}
      {error ? (
        <AtlasRecoverableError
          description={error}
          onRetry={() => setReloadKey((value) => value + 1)}
          busy={loading}
          scope="page"
        />
      ) : null}
      {loading && !data ? <AtlasSkeleton className="h-72 w-full" /> : null}

      {/* ═══ 2 · PRONTIDÃO DA AQUISIÇÃO ═════════════════════════════════════
             O que decide se ENTRA lead amanhã. Vinha na resposta desde sempre e
             a tela descartava — enquanto exibia CPL "—", que sem esta moldura se
             lê como "ainda não gastamos" e não como "o teto da conta acabou".
             É a decisão mais cara desta tela, então é o primeiro bloco depois da
             faixa: cada bloqueio já chega com a AÇÃO escrita.
             ══════════════════════════════════════════════════════════════ */}
      {data ? (
        <section
          aria-label="Prontidão da aquisição e verba sem retorno"
          className={`cc5-reveal ${cc5Panel}`}
          style={{ animationDelay: "40ms" }}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
            <p className={cc5Eyebrow} title="Leitura só de leitura na Graph API da Meta: nada é criado, pausado ou alterado.">
              Prontidão · entra lead amanhã?
            </p>
            {!readiness ? (
              <span className={`${cc5Chip} ${chipTone.neutral}`}>SEM LASTRO</span>
            ) : !readiness.medido ? (
              <span className={`${cc5Chip} ${chipTone.amber}`}>NÃO MEDIDO</span>
            ) : bloqueios.length === 0 ? (
              <span className={`${cc5Chip} ${chipTone.emerald}`}>SEM BLOQUEIO</span>
            ) : (
              <span className={`${cc5Chip} ${bloqueios.some((b) => b.gravidade === "critical") ? chipTone.rose : chipTone.amber}`}>
                {bloqueios.length} BLOQUEIO{bloqueios.length > 1 ? "S" : ""}
              </span>
            )}
            {readiness?.medido ? (
              <p className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-micro tabular-nums text-[var(--atlas-texto-medio)]">
                <span className={readiness.conta && !readiness.conta.ativa ? semanticInk.danger : undefined}>
                  conta {readiness.conta ? (readiness.conta.ativa ? "ativa" : "INATIVA") : "—"}
                </span>
                <span>
                  {readiness.campanhas.ativas} de {readiness.campanhas.total} campanha(s) ativa(s)
                </span>
                <span>{readiness.anunciosAtivos} anúncio(s) ativo(s)</span>
                <span
                  className={readiness.verba.esgotado ? semanticInk.danger : undefined}
                  title={
                    readiness.verba.tetoBrl === null
                      ? "A conta não declara teto de gasto — não há restante a calcular."
                      : `Teto ${brl(readiness.verba.tetoBrl)} · gasto ${readiness.verba.gastoBrl === null ? "—" : brl(readiness.verba.gastoBrl)}`
                  }
                >
                  {readiness.verba.tetoBrl === null
                    ? "sem teto declarado"
                    : readiness.verba.esgotado
                      ? "TETO ESGOTADO"
                      : `${readiness.verba.restanteBrl === null ? "—" : brl(readiness.verba.restanteBrl)} de teto restante`}
                </span>
              </p>
            ) : null}
          </div>
          {!readiness ? (
            <p className="cc6-hairline px-5 py-3 text-corpo leading-5 text-[var(--atlas-texto-medio)]">
              Sem lastro — esta resposta não trouxe a leitura de prontidão da conta de anúncios. Sem ela, um CPL
              omitido não distingue &quot;ainda não investimos&quot; de &quot;a verba não vai trazer lead&quot;.
            </p>
          ) : !readiness.medido ? (
            <p className="cc6-hairline px-5 py-3 text-corpo leading-5 text-[var(--atlas-texto-medio)]">
              Não medido — {readiness.motivo} Leitura que falha aparece como não medida, nunca como saudável.
            </p>
          ) : bloqueios.length === 0 ? (
            <p className="cc6-hairline px-5 py-3 text-corpo leading-5 text-[var(--atlas-texto-medio)]">
              Nenhum bloqueio de aquisição na leitura da conta — verba, campanhas, páginas e formulários conferem.
            </p>
          ) : (
            <ul>
              {bloqueios.map((bloqueio, index) => (
                <li
                  key={`${bloqueio.codigo}-${index}`}
                  className="cc6-hairline cc6-sev-band flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3 pl-8 pr-5"
                  style={
                    {
                      "--cc6-sev":
                        bloqueio.gravidade === "critical"
                          ? "var(--atlas-estado-perigo)"
                          : "var(--atlas-estado-atencao)",
                    } as CSSProperties
                  }
                >
                  <span
                    className={`font-mono text-micro font-semibold uppercase tracking-[.16em] ${
                      bloqueio.gravidade === "critical" ? semanticInk.danger : semanticInk.warning
                    }`}
                  >
                    {bloqueio.gravidade === "critical" ? "Crítico" : "Atenção"}
                  </span>
                  <span className="min-w-0 flex-1 text-corpo leading-5 text-[var(--atlas-texto-forte)]">
                    {bloqueio.resumo}
                  </span>
                  <span className="min-w-0 basis-full text-corpo leading-5 text-[var(--atlas-texto-medio)] sm:basis-auto">
                    → {bloqueio.acao}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* ── VERBA QUE JÁ SAIU E NÃO TROUXE LEAD ────────────────────────────
              Fora de qualquer ramo de `readiness`: este fato vem da carga de
              qualidade, não da Graph, e não pode desaparecer quando a leitura da
              Meta falha — que é justamente quando ele mais importa. Mesmo
              tratamento geométrico dos bloqueios (faixa de severidade) porque é
              da mesma classe: dinheiro que exige decisão hoje. */}
          {verbaSemRetorno ? (
            <div
              className="cc6-hairline cc6-sev-band flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3 pl-8 pr-5"
              style={{ "--cc6-sev": "var(--atlas-estado-perigo)" } as CSSProperties}
              /* A frase pronta da fonte fica no title, não no corpo: ela reafirma
                 o MESMO valor com centavos enquanto `brl` arredonda, e a mesma
                 quantia impressa duas vezes com precisões diferentes, no mesmo
                 bloco, é a receita de duas verdades. Nada se perde — o texto da
                 fonte continua legível, e o número aparece uma vez só. */
              title={verbaSemRetorno.frase ?? undefined}
            >
              <span
                className={`font-mono text-micro font-semibold uppercase tracking-[.16em] ${semanticInk.danger}`}
              >
                Verba sem retorno
              </span>
              <span className={`cc6-num text-numero font-semibold leading-none ${semanticInk.danger}`}>
                {brl(verbaSemRetorno.valor)}
              </span>
              <span className="min-w-0 flex-1 text-corpo leading-5 text-[var(--atlas-texto-forte)]">
                {verbaSemRetorno.campanhas > 0
                  ? `lançados em ${verbaSemRetorno.campanhas} campanha(s) que não trouxeram nenhuma lead a este CRM na janela.`
                  : "lançados sem nenhuma lead atribuída a campanha nesta janela."}
              </span>
              <span className="min-w-0 basis-full text-corpo leading-5 text-[var(--atlas-texto-medio)]">
                → Duas leituras cabem neste número e as duas pedem decisão: a campanha não entrega, ou a lead entra
                sem atribuição. O conselheiro abaixo separa as duas, campanha a campanha.
              </span>
              <span className="min-w-0 basis-full font-mono text-micro leading-4 text-[var(--atlas-texto-fraco)]">
                {verbaSemRetorno.frase
                  ? "Nenhuma campanha com gasto trouxe lead nesta janela: o CPL da organização fica sem base e aparece como traço."
                  : "Fora do CPL da organização de propósito — diluir este gasto nas leads que chegaram por outros caminhos daria um custo por lead plausível e sem base."}
              </span>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ═══ 3 · DECISÕES DE CAMPANHA ═══════════════════════════════════════
             O Conselheiro era o ÚLTIMO bloco da página, depois de uma tabela de
             dez colunas com rolagem horizontal — quer dizer: numa tela de 900px
             o diretor não via uma única decisão sem rolar. Ele é a razão de a
             tela existir, então subiu.

             Dentro do painel, a mesma inversão foi desfeita: a "Trava de
             segurança" (texto de política, imutável, que não muda de um dia
             para o outro) ocupava uma caixa inteira ACIMA das recomendações.
             É auditoria — desceu para o rodapé, com o mesmo texto.
             ══════════════════════════════════════════════════════════════ */}
      <section
        aria-label="Decisões de campanha recomendadas"
        className={`cc5-reveal ${cc5Panel}`}
        style={{ animationDelay: "70ms" }}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
          <p
            className={cc5Eyebrow}
            title="Recomenda o próximo passo por campanha cruzando qualidade, funil e descartes. Ordenado por consequência: o que queima verba primeiro, o que merece verba depois."
          >
            Decisão · Conselheiro Andromeda
          </p>
          {advisor ? (
            <span className={`${cc5Chip} ${advisor.engine === "generative" ? chipTone.accent : chipTone.neutral}`}>
              {advisor.engine === "generative"
                ? `IA GENERATIVA${advisor.model ? ` · ${advisor.model}` : ""}`
                : "REGRAS DETERMINÍSTICAS"}
            </span>
          ) : null}
          {advisor && decisoes.length > 0 ? (
            <span
              className={`${cc5Chip} ${decisoesQuePedemAcao > 0 ? chipTone.amber : chipTone.neutral}`}
              title="Recomendações que pedem um gesto do gestor (tudo que não é MANTER)."
            >
              {decisoesQuePedemAcao} de {decisoes.length} pedem ação
            </span>
          ) : null}
        </div>
        {advisorError ? (
          <div className="px-5 pb-4">
            <AtlasRecoverableError
              description={advisorError}
              onRetry={() => setReloadKey((value) => value + 1)}
              busy={advisorLoading}
              scope="module"
            />
          </div>
        ) : advisorLoading && !advisor ? (
          <div className="px-5 pb-4">
            <AtlasSkeleton className="h-40 w-full" />
          </div>
        ) : decisoes.length === 0 ? (
          <div className="px-5 pb-4">
            <AtlasEmpty
              reason="no-activity"
              title="Nenhuma recomendação na janela"
              description="Assim que campanhas tiverem leads na janela, o conselheiro cruza qualidade, funil e descartes para sugerir o próximo passo — sempre sob aprovação humana."
            />
          </div>
        ) : (
          <ul>
            {decisoes.map((rec) => (
              <li
                key={rec.campaignId}
                className="cc6-hairline cc6-sev-band py-3 pl-8 pr-5"
                style={{ "--cc6-sev": advisorActionBand[rec.action] } as CSSProperties}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={`${cc5Chip} ${chipTone[advisorActionChips[rec.action]]}`}>
                    {advisorActionLabels[rec.action]}
                  </span>
                  <span className="min-w-0 font-medium text-[var(--atlas-texto-forte)]">{rec.campaignName}</span>
                  <span className="ml-auto font-mono text-micro uppercase tracking-[.14em] text-[var(--atlas-texto-fraco)]">
                    confiança {advisorConfidenceLabels[rec.confidence]}
                  </span>
                </div>
                <p className="mt-1.5 max-w-[92ch] text-corpo leading-6 text-[var(--atlas-texto-medio)]">{rec.rationale}</p>
                {/* O que reportar à Meta é a EXECUÇÃO da decisão, não a decisão.
                    Recolhido por linha: some da leitura de quem está escolhendo,
                    continua a um clique de quem já escolheu. */}
                <details className="group mt-1">
                  <summary
                    className={`flex min-h-11 cursor-pointer list-none items-center gap-2 font-mono text-micro font-semibold uppercase tracking-[.16em] text-[var(--atlas-accent)] transition-colors hover:text-[var(--atlas-texto-forte)] ${cc5Focus}`}
                  >
                    <span aria-hidden="true" className="transition-transform group-open:rotate-90">
                      ›
                    </span>
                    Feedback → Meta
                  </summary>
                  <p className="max-w-[92ch] pb-1 text-corpo leading-5 text-[var(--atlas-texto-medio)]">
                    {rec.metaFeedbackHint}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        )}
        <p className="cc6-hairline px-5 py-2.5 text-corpo leading-5 text-[var(--atlas-texto-fraco)]">
          <span className="font-mono text-micro font-semibold uppercase tracking-[.16em] text-[var(--atlas-estado-atencao)]">
            Trava de segurança
          </span>{" "}
          — aprovação humana obrigatória: cada recomendação é um conselho para o gestor executar. O Atlas não altera
          verba, não pausa campanha e não envia nada à Meta automaticamente. Fonte /api/v1/ai/andromeda-advisor · só
          agregados · zero PII.
        </p>
      </section>

      {/* ═══ 4 · INDICADORES DA JANELA ══════════════════════════════════════
             Eram QUATRO painéis, quatro hairlines e quatro números de 34px
             disputando o mesmo peso — quatro heróis é nenhum herói. Viraram um
             painel só; a taxa de qualificação, que é o assunto da tela, fica no
             degrau de herói e os outros três no degrau de comparação (20px),
             que é exatamente o que a escala diz que eles são.
             ══════════════════════════════════════════════════════════════ */}
      {totals && data ? (
        <section
          aria-label="Indicadores da janela"
          className={`cc5-reveal ${cc5Panel} grid gap-y-1 sm:grid-cols-2 xl:grid-cols-4`}
          style={{ animationDelay: "100ms" }}
        >
          <Indicador
            heroi
            eyebrow="Qualificação de cadastro"
            explain="Parcela dos leads da janela com cadastro qualificado (score alto ou lead quente) — é proxy de cadastro, NÃO é venda; a venda aparece no número de vendas ao lado. A linha abaixo traz o segundo eixo ao lado do primeiro: quantas dessas leads chegaram a etapa canônica de visita, proposta, contrato ou ganho. A distância entre os dois é a pergunta que o número sozinho não responde. Fonte: /api/v1/analytics/campaign-quality."
            value={totals.leads > 0 ? `${Math.round((totals.qualified / totals.leads) * 1000) / 10}%` : "—"}
            /* O eixo comercial chegava nos TOTAIS e só o proxy de cadastro era
               impresso — o mesmo resgate que o ranking já tinha feito linha a
               linha, e que faltava embaixo do número de 34px. */
            detail={
              typeof totals.commercialQualified === "number"
                ? `${totals.qualified} de ${totals.leads} cadastro · ${totals.commercialQualified} comercial · ${totals.sales} vendas`
                : `${totals.qualified} de ${totals.leads} leads · ${totals.sales} vendas`
            }
            barClass="bg-[var(--atlas-accent)]"
            trend={trendLine("qualification_rate")}
          />
          <Indicador
            eyebrow="Taxa de descarte"
            explain="Crítica acima de 25% da janela: leads que o time descartou, com motivo na taxonomia Meta quando classificado."
            value={totals.leads > 0 ? `${Math.round((totals.discarded / totals.leads) * 1000) / 10}%` : "—"}
            valueClass={discardCritical ? "text-[var(--atlas-estado-perigo)]" : "text-[var(--atlas-texto-forte)]"}
            detail={
              totals.discarded > 0
                ? `${totals.classifiedDiscards} de ${totals.discarded} com motivo (${Math.round((totals.classifiedDiscards / totals.discarded) * 100)}%)${
                    totals.unattributedDiscards > 0 ? ` · ${totals.unattributedDiscards} sem campanha` : ""
                  }`
                : "nenhum descarte na janela"
            }
            barClass={
              discardCritical
                ? "bg-[var(--atlas-estado-perigo)]"
                : "bg-[color-mix(in_srgb,var(--atlas-texto-fraco)_45%,transparent)]"
            }
            trend={trendLine("discard_category_share")}
          />
          <Indicador
            eyebrow="CPL da organização"
            explain="Custo por lead calculado SÓ sobre campanhas que têm as duas pontas — gasto lançado e lead atribuída no CRM. O gasto das campanhas sem lead não entra nesta divisão: ele aparece inteiro como verba sem retorno, no painel de prontidão. Valor publicado por /api/v1/analytics/campaign-quality; a tela não redivide nada."
            value={cplOrg === undefined || cplOrg === null ? "—" : brl(cplOrg)}
            detail={
              cplOrg !== undefined && cplOrg !== null
                ? cplQualificada !== undefined && cplQualificada !== null
                  ? `${brl(totals.spend)} investidos · ${brl(cplQualificada)} por qualificada`
                  : `${brl(totals.spend)} investidos · sem qualificada entre as campanhas com gasto`
                : cplOrg === undefined
                  ? "CPL não publicado nesta resposta — sem lastro para dividir aqui"
                  : totals.spend > 0
                    ? `${brl(totals.spend)} investidos · nenhuma campanha com gasto trouxe lead — CPL sem base`
                    : spendCoverage === "sem_lancamento"
                      ? "sem lançamento na janela (marketing_spend)"
                      : data.policy.spendMeasured
                        ? "sem gasto atribuído a campanha na janela"
                        : "leitura de custo indisponível (marketing_spend)"
            }
            /* A barra de tom é o primeiro sinal lido, antes de qualquer palavra:
               ela vira âmbar quando o número NÃO tem base — leitura de custo
               indisponível ou gasto sem nenhuma lead atribuída. Um traço cinza
               parece "ainda não investimos"; o traço âmbar diz que há dinheiro
               lançado e nenhuma base para dividir. */
            barClass={
              data.policy.spendMeasured && !(cplOrg === null && totals.spend > 0) && cplOrg !== undefined
                ? "bg-[color-mix(in_srgb,var(--atlas-texto-fraco)_45%,transparent)]"
                : "bg-[var(--atlas-estado-atencao)]"
            }
            trend={trendLine("cost_per_lead")}
          />
          <Indicador
            eyebrow="Campanhas com leads"
            explain="Campanhas ranqueadas na janela versus o total cadastrado na organização."
            value={`${totals.campaignsRanked}`}
            detail={`${totals.campaigns} na organização · janela de ${data.period.days} dias`}
            barClass="bg-[color-mix(in_srgb,var(--atlas-texto-fraco)_45%,transparent)]"
            trend={trendLine("lead_volume")}
          />
        </section>
      ) : null}

      {/* ═══ 5 · RANKING ════════════════════════════════════════════════════ */}
      {data ? (
        <section
          aria-label="Ranking de campanhas por qualidade"
          className={`cc5-reveal ${cc5Panel}`}
          style={{ animationDelay: "140ms" }}
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3 sm:px-6">
            <p
              className={cc5Eyebrow}
              title="Fonte: /api/v1/analytics/campaign-quality — tabelas vivas marketing_campaigns, leads, lead_events, marketing_spend."
            >
              Ranking · Qualidade da lead
            </p>
            <h2 className="text-base font-semibold tracking-tight text-[var(--atlas-texto-forte)]">
              Campanhas ordenadas pela qualidade da lead
            </h2>
            <p className="ml-auto font-mono text-micro tabular-nums text-[var(--atlas-texto-fraco)]">
              Nota A: {data.policy.qualityGradeRule.A} · Nota B: {data.policy.qualityGradeRule.B}
            </p>
          </div>
          {/* A nota de amostra mínima era um painel inteiro solto no meio da
              página; aqui ela é contexto da tabela que ela qualifica — mesma
              frase, ao lado do que ela explica. */}
          {insufficient > 0 ? (
            <p role="note" className="cc6-hairline px-5 py-2 text-corpo leading-5 text-[var(--atlas-texto-medio)] sm:px-6">
              <span className="font-mono text-micro font-semibold uppercase tracking-[.16em] text-[var(--atlas-estado-atencao)]">
                Amostra mínima · {minimum} leads
              </span>{" "}
              —{" "}
              <span className="cc6-num font-semibold text-[var(--atlas-texto-forte)]">{insufficient}</span>{" "}
              {insufficient === 1 ? "campanha ainda não atingiu" : "campanhas ainda não atingiram"} a amostra mínima de{" "}
              <span className="cc6-num font-semibold text-[var(--atlas-texto-forte)]">{minimum}</span> leads — sem nota
              de qualidade e sem decisão de verba até lá.
            </p>
          ) : null}
          <div className="overflow-x-auto">
            {ranking.length === 0 ? (
              <div className="p-5 sm:px-6">
                <AtlasEmpty
                  reason="no-activity"
                  title="Nenhuma campanha com leads na janela"
                  description="Assim que leads chegarem com campaign_id preenchido (portais, Meta ou importação), o ranking de qualidade aparece aqui. Amplie o período para 90 dias ou confira as integrações."
                  action={<Link href="/integrations" className="atlas-button-secondary inline-flex min-h-11 items-center">Ver integrações</Link>}
                />
              </div>
            ) : (
              <table className="w-full min-w-[1060px] text-left text-corpo text-[var(--atlas-texto-medio)]">
                <caption className="sr-only">
                  Campanhas ordenadas pela qualidade da lead na janela de {data.period.days} dias.
                </caption>
                <thead>
                  <tr className="cc6-hairline font-mono text-micro uppercase tracking-[.14em] text-[var(--atlas-texto-fraco)]">
                    <th scope="col" className="py-2.5 pl-5 pr-4 font-semibold sm:pl-6">Campanha</th>
                    <th scope="col" className="py-2.5 pr-4 font-semibold">Qualidade</th>
                    <th scope="col" className="py-2.5 pr-4 text-right font-semibold">Leads</th>
                    <th scope="col" className="py-2.5 pr-4 text-right font-semibold">Qualificação</th>
                    <th scope="col" className="py-2.5 pr-4 text-right font-semibold">Score médio</th>
                    <th scope="col" className="py-2.5 pr-4 text-right font-semibold">Descartes</th>
                    <th scope="col" className="py-2.5 pr-4 text-right font-semibold">Vendas</th>
                    <th scope="col" className="py-2.5 pr-4 text-right font-semibold">Investimento</th>
                    <th scope="col" className="py-2.5 pr-4 text-right font-semibold">CPL</th>
                    <th scope="col" className="py-2.5 pr-5 text-right font-semibold sm:pr-6">CPL qualificado</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((row) => (
                    <tr
                      key={row.id}
                      className="cc6-hairline align-top transition-colors hover:bg-[color-mix(in_srgb,var(--atlas-accent)_6%,transparent)]"
                    >
                      <td className="py-3 pl-5 pr-4 sm:pl-6">
                        <div className="font-medium text-[var(--atlas-texto-forte)]">{row.name}</div>
                        {/* Linha registrada por automação (ingestão/backfill) a
                            partir de um id externo: o Atlas nunca consultou o
                            estado dela na Meta, então o status não é impresso
                            como se fosse fato verificado. */}
                        <div
                          className="mt-0.5 font-mono text-micro uppercase tracking-[.08em] text-[var(--atlas-texto-fraco)]"
                          title={isAutoRegisteredCampaign(row.name) ? AUTO_REGISTERED_CAMPAIGN_STATUS_TITLE : undefined}
                        >
                          {row.platform} ·{" "}
                          {isAutoRegisteredCampaign(row.name) ? AUTO_REGISTERED_CAMPAIGN_STATUS_LABEL : row.status}
                          {/* Maturidade observável: 40 leads acumuladas em 90
                              dias e 40 em 3 dias não pedem a mesma decisão de
                              verba, e a linha mostrava as duas iguais. Entra na
                              linha que já existe — informação a mais, zero
                              filete e zero coluna a mais numa tabela que já
                              rola na horizontal. */}
                          {row.oldestLeadAt ? (
                            <>
                              {" · "}
                              <span title="Data da lead mais antiga desta campanha na janela — maturidade observável do bucket.">
                                desde {isoDay(row.oldestLeadAt)}
                              </span>
                            </>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        {row.sampleSufficient && row.qualityGrade ? (
                          <span
                            className={`${cc5Chip} ${chipTone[gradeChips[row.qualityGrade]]}`}
                            /* A régua que produziu ESTA nota viaja por linha e a
                               tela descartava. Nota de régua diferente não é
                               comparável com a da linha de cima — auditoria, e
                               por isso vai para o title: custo zero de pixel. */
                            title={
                              typeof row.qualityGradeRuleVersion === "number"
                                ? `Régua da nota v${row.qualityGradeRuleVersion} — nota produzida por régua diferente não é comparável com a das outras linhas.`
                                : undefined
                            }
                          >
                            NOTA {row.qualityGrade}
                          </span>
                        ) : (
                          <span
                            className={`${cc5Chip} ${chipTone.amber}`}
                            title={`Abaixo da amostra mínima de ${minimum} leads — sem nota e sem decisão de verba.`}
                          >
                            AMOSTRA INSUFICIENTE
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <span className="cc6-num text-[var(--atlas-texto-forte)]">{row.leads}</span>
                        <BarraDeVolume leads={row.leads} maxLeads={maxLeads} />
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <span
                          className="cc6-num text-[var(--atlas-texto-forte)]"
                          title={
                            typeof row.qualificationBaseLeads === "number"
                              ? `Base de cadastro medida: ${row.qualificationBaseLeads} de ${row.leads} lead(s) têm score_ia preenchido ou temperature quente.`
                              : undefined
                          }
                        >
                          cad {row.qualifiedLeads}
                        </span>{" "}
                        <span
                          className="cc6-num text-micro text-[var(--atlas-texto-fraco)]"
                          title={row.qualificationRate === null ? omission(row) : undefined}
                        >
                          ({row.qualificationRate === null ? "—" : `${row.qualificationRate}%`})
                        </span>
                        {row.qualificationRate !== null ? (
                          <span
                            aria-hidden="true"
                            className="ml-auto mt-1 block h-[3px] w-16 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--atlas-texto-fraco)_24%,transparent)]"
                          >
                            <span
                              className="block h-full rounded-full bg-[color-mix(in_srgb,var(--atlas-accent)_85%,transparent)]"
                              style={{ width: `${Math.min(100, Math.max(0, row.qualificationRate))}%` }}
                            />
                          </span>
                        ) : null}
                        {/* O eixo COMERCIAL vinha na resposta e a tela não
                            mostrava. É o que separa "o cadastro parecia bom" de
                            "o funil andou" — e o único dos dois que divide pela
                            mesma base que o descarte. */}
                        {typeof row.commercialQualifiedLeads === "number" ? (
                          <span
                            className="mt-1 block cc6-num text-micro text-[var(--atlas-texto-medio)]"
                            title="Qualificação comercial: lead em etapa canônica de visita, proposta, contrato ou ganho."
                          >
                            com {row.commercialQualifiedLeads} (
                            {row.commercialQualificationRate === null || row.commercialQualificationRate === undefined
                              ? "—"
                              : `${row.commercialQualificationRate}%`}
                            )
                          </span>
                        ) : null}
                      </td>
                      <td
                        className="cc6-num py-3 pr-4 text-right text-[var(--atlas-texto-forte)]"
                        title={
                          row.avgScore === null
                            ? "Nenhum lead desta campanha tem score_ia preenchido na janela — média omitida em vez de virar zero."
                            : undefined
                        }
                      >
                        {row.avgScore ?? "—"}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <span
                          className={`cc6-num ${
                            row.discardRate !== null && row.discardRate > 25
                              ? "text-[var(--atlas-estado-perigo)]"
                              : "text-[var(--atlas-texto-forte)]"
                          }`}
                        >
                          {row.discarded}
                        </span>
                        {row.discardRate !== null && row.discarded > 0 ? (
                          <span className="cc6-num text-micro text-[var(--atlas-texto-fraco)]"> ({row.discardRate}%)</span>
                        ) : null}
                        <BarraDeDescarte mix={row.discardsByMetaCategory} total={row.discarded} />
                        {/* Os chips de categoria mostravam só as três primeiras
                            e desenhavam três bordas por linha. A barra acima
                            mostra a composição INTEIRA; aqui fica a legenda
                            legível, sem filete. */}
                        {row.discardsByMetaCategory.length ? (
                          <div className="mt-1 font-mono text-micro leading-4 text-[var(--atlas-texto-fraco)]">
                            {row.discardsByMetaCategory
                              .slice(0, 3)
                              .map((item) => `${metaCategoryLabels[item.category] ?? item.category} ${item.count}`)
                              .join(" · ")}
                            {row.discardsByMetaCategory.length > 3
                              ? ` · +${row.discardsByMetaCategory.length - 3}`
                              : ""}
                          </div>
                        ) : null}
                        {row.topDiscardReason ? (
                          <div className="mt-0.5 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
                            Principal: {row.topDiscardReason.label}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <span className="cc6-num text-[var(--atlas-texto-forte)]">{row.sales}</span>{" "}
                        <span
                          className="cc6-num text-micro text-[var(--atlas-texto-fraco)]"
                          title={row.conversionRate === null ? omission(row) : undefined}
                        >
                          ({row.conversionRate === null ? "—" : `${row.conversionRate}%`})
                        </span>
                      </td>
                      <td
                        className="cc6-num py-3 pr-4 text-right text-[var(--atlas-texto-forte)]"
                        title={
                          row.spend > 0
                            ? undefined
                            : "Nenhum lançamento em marketing_spend atribuído a esta campanha na janela — o traço é ausência de lançamento, não gasto zero."
                        }
                      >
                        {row.spend > 0 ? brl(row.spend) : "—"}
                      </td>
                      <td
                        className="cc6-num py-3 pr-4 text-right text-[var(--atlas-texto-forte)]"
                        title={row.costPerLead === null ? (row.sampleSufficient ? "Sem investimento lançado na janela — CPL omitido em vez de fingir zero." : omission(row)) : undefined}
                      >
                        {row.costPerLead === null ? "—" : brl(row.costPerLead)}
                      </td>
                      <td
                        className="cc6-num py-3 pr-5 text-right text-[var(--atlas-texto-forte)] sm:pr-6"
                        title={
                          row.costPerQualifiedLead === null
                            ? row.sampleSufficient
                              ? "Sem investimento lançado ou sem lead qualificada na janela — custo omitido em vez de fingir zero."
                              : omission(row)
                            : undefined
                        }
                      >
                        {/* O prefixo só aparece quando existe o par a distinguir
                            — rótulo que não separa nada é rótulo repetido. */}
                        {row.costPerCommercialQualifiedLead !== undefined ? "cad " : ""}
                        {row.costPerQualifiedLead === null ? "—" : brl(row.costPerQualifiedLead)}
                        {/* `costPerCommercialQualifiedLead` estava DECLARADO no
                            tipo desta página e nunca era renderizado: campo
                            morto no código e ausente na tela. É o mesmo custo
                            medido contra o denominador que tem evidência de
                            funil — e o par cadastro/comercial já é o vocabulário
                            da coluna de qualificação. Segunda linha na célula
                            que já existe, não uma décima primeira coluna numa
                            tabela que já rola na horizontal. */}
                        {row.costPerCommercialQualifiedLead !== undefined ? (
                          <span
                            className="cc6-num mt-1 block text-micro text-[var(--atlas-texto-medio)]"
                            title="Custo por lead com evidência comercial: mesmo gasto, dividido por quem chegou a visita, proposta, contrato ou ganho."
                          >
                            com{" "}
                            {row.costPerCommercialQualifiedLead === null
                              ? "—"
                              : brl(row.costPerCommercialQualifiedLead)}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      ) : null}

      {/* ═══ 6 · ANALISTA (NARRA) ═══════════════════════════════════════════
             O Analista narra; quem recomenda é o Conselheiro, que agora está
             acima. As linhas de proveniência e o "atualizado há Xs" — que é
             telemetria — desceram para o rodapé do painel.
             ══════════════════════════════════════════════════════════════ */}
      <section
        aria-label="Analista Andromeda em dedicação integral"
        className={`cc5-reveal ${cc5Panel} ${cc5PanelHover}`}
        style={{ animationDelay: "180ms" }}
      >
        {/* Flutuação MUITO sutil do robô — keyframes inline (globals.css é
            intocável) sob motion-safe: zero movimento em reduced-motion. */}
        <style>{"@keyframes atlasAnalystFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}"}</style>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 sm:px-6">
          <p
            className={cc5Eyebrow}
            title="Narra a janela: compara com o período anterior de mesmo tamanho e aponta anomalias."
          >
            Analista · Dedicação full-time
          </p>
          {analyst ? (
            <span className={`${cc5Chip} ${analyst.engine === "generative" ? chipTone.accent : chipTone.neutral}`}>
              {analyst.engine === "generative" ? "IA GENERATIVA" : "DETERMINÍSTICO"}
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-5 px-5 pb-4 sm:flex-row sm:items-start sm:px-6">
          <figure className={`${cc5Inner} shrink-0 self-center px-3 pb-2 pt-3 sm:self-start`}>
            <div className="motion-safe:[animation:atlasAnalystFloat_7s_ease-in-out_infinite]">
              <Image
                src="/brand/atlas-robot-assistant.png"
                alt="Robô analista Atlas em dedicação integral às campanhas"
                width={140}
                height={210}
                className="h-auto w-[96px] object-contain sm:w-[112px]"
              />
            </div>
            <figcaption className="cc6-hairline mt-2 pt-1.5 text-center font-mono text-micro font-semibold uppercase tracking-[.18em] text-[var(--atlas-texto-fraco)]">
              Andromeda · on
            </figcaption>
          </figure>
          <div className="min-w-0 flex-1 space-y-3">
            {analystError ? (
              <AtlasRecoverableError
                description={analystError}
                onRetry={() => setReloadKey((value) => value + 1)}
                busy={analystLoading}
                scope="module"
              />
            ) : analystLoading && !analyst ? (
              <AtlasSkeleton className="h-24 w-full" />
            ) : analyst && data && data.ranking.length === 0 ? (
              <AtlasEmpty
                reason="no-activity"
                title="Nada para narrar ainda"
                description="Assim que campanhas tiverem leads na janela, o analista compara a janela atual com a anterior, aponta anomalias e escreve o resumo executivo aqui."
              />
            ) : analyst ? (
              <>
                {/* Era `text-[15px]`: fora dos cinco degraus da escala (micro 10
                    · rótulo 11 · corpo 13 · número 20 · herói 34) e, pior, MAIOR
                    que os 13px do rationale do conselheiro — o bloco que NARRA
                    renderizava sua prosa acima do bloco que DECIDE, invertendo a
                    hierarquia por tipografia. Volta para corpo. */}
                <p aria-live="polite" className="max-w-[62ch] text-corpo leading-6 text-[var(--atlas-texto-forte)]">
                  {analyst.narrative}
                </p>
                {analyst.anomalies.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {analyst.anomalies.slice(0, 6).map((anomaly) => (
                      <span
                        key={`${anomaly.campaignId}-${anomaly.kind}`}
                        title={anomaly.evidence}
                        className={`${cc5Chip} ${semanticChip[analystAnomalyTone(anomaly)]}`}
                      >
                        {analystKindLabels[anomaly.kind]} {analystAnomalyDelta(anomaly)} · {anomaly.campaignName}
                      </span>
                    ))}
                    {analyst.anomalies.length > 6 ? (
                      <span className={`${cc5Chip} ${chipTone.neutral}`}>+{analyst.anomalies.length - 6}</span>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-corpo text-[var(--atlas-texto-fraco)]">
                    Nenhuma anomalia entre a janela atual e a anterior de mesmo tamanho.
                  </p>
                )}
              </>
            ) : null}
          </div>
        </div>
        <p className="cc6-hairline flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 font-mono text-micro leading-4 text-[var(--atlas-texto-fraco)] sm:px-6">
          <span>
            fonte /api/v1/ai/campaign-analyst · só agregados · zero PII · narra; quem recomenda é o conselheiro
          </span>
          {analyst ? <span className="ml-auto tabular-nums">atualizado há {analystAgeSeconds}s</span> : null}
        </p>
      </section>
    </div>
  );
}
