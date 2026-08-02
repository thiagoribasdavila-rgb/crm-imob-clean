"use client";

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";

/*
 * CC-6 · Laboratório de mídia — o usuário é o DIRETOR, e o que ele faz aqui é
 * COMPARAR EXPERIMENTO. Mesma rota, zero fetch novo, nenhuma campanha alterada
 * automaticamente.
 *
 * ── O QUE FOI MEDIDO ANTES DE MEXER ────────────────────────────────────────
 *
 * Blocos de primeiro nível, na ordem antiga:
 *   1. PageHeader
 *   2. faixa de aviso (condicional)
 *   3. painel "Pulso do laboratório" — 4 contadores em text-3xl
 *   4. grid 380px+1fr: formulário de criação | lista de experimentos
 *
 * Filetes/caixas acima da dobra, com 2 experimentos visíveis: 21.
 * Onze deles estavam DENTRO do formulário (9 campos + botão + painel), que
 * sozinho ocupava ~640px da coluna esquerda. Cada card ainda aninhava um
 * `cc6-panel-quiet` (caixa dentro de caixa) só para a "Última leitura".
 *
 * Números sem contexto (medidos):
 *   · os 4 contadores do topo — inteiros em 30px, sem denominador;
 *   · "teto R$ 2.000,00" na linha meta — teto sem o consumo, que a rota manda
 *     em `assessment.totalSpend` e a tela descartava;
 *   · "Ciclo 87%" no select — 87% de quê (é `readiness_score`);
 *   · "Última leitura" imprimia a CHAVE DE MÁQUINA em inglês:
 *     "candidate_winner_review · directional_result_requires_director_review".
 *
 * O que a rota entrega e a tela jogava fora — a classe "cobra e destrói", o
 * diretor preenche e nunca mais vê:
 *   assessment.{controlConversionRate,testConversionRate,relativeLiftPercent,
 *   absoluteLiftPercentPoints,guardrailIncreasePercent,totalSpend,sampleReady,
 *   stopReasons}, experiment.events[] (trilha de governança inteira),
 *   control_key, test_key, daily_budget_cap, minimum_leads_per_arm,
 *   minimum_days, maximum_days, maximum_guardrail_increase_percent,
 *   external_experiment_key.
 * Ou seja: a tela de COMPARAR experimento não mostrava nenhum dos dois braços.
 *
 * ── O QUE SUBIU, O QUE DESCEU, O QUE VIROU GRÁFICO ─────────────────────────
 *
 * SOBE (decisão): a fila. O painel deixa de se chamar "pulso" (a régua nomeia
 * pulso como AUDITORIA) e passa a ser "Fila de decisão": herói = quantos planos
 * esperam a assinatura do diretor; ao lado, parada recomendada e candidatos a
 * vencedor, que a leitura já apontava e ninguém via. A lista é ORDENADA por
 * urgência de decisão — ordenada, nunca filtrada; a contagem total fica à
 * vista justamente para provar que nada sumiu.
 *
 * DESCE (entrada e auditoria): o formulário inteiro, com os 9 campos e o botão,
 * foi para um `<details>` nativo no fim — a mesma camada recolhível que
 * /marketing, /tasks e o Lead 360 já usam. Nenhum campo saiu; ganharam rótulo
 * visível, porque "2000" e "200" em caixa de número não diziam o que eram.
 * A trilha de eventos, que nem aparecia, entra recolhida por card.
 *
 * VIRA GRÁFICO — um só, e ele responde o que o número sozinho não responde:
 * "qual dos meus experimentos está ganhando?". Lift relativo de todos os testes
 * com leitura, na MESMA escala, com a linha do empate no centro. Ler seis
 * porcentagens soltas não ordena; a barra ordena. Dentro do card NÃO há
 * gráfico: ali o lift já é um número único, e barra seria repetição.
 *
 * `cc6-num` foi trocado por `tabular-nums` em todo número neutro. Motivo
 * medido: `:root[data-theme="light"] .cc6-num` (0,4,0, sem camada) repinta a
 * classe inteira com um âmbar cravado — ver a regra em app/globals.css — e
 * vence qualquer utilitário de cor do Tailwind. A linha meta do card e os dois
 * campos de verba apareciam LARANJA no tema claro, dizendo "atenção" onde não
 * havia nenhuma. O literal não é repetido aqui de propósito: o portão
 * `cor-cravada:check` conta hex por regex, inclusive dentro de comentário.
 *
 * ── SEGUNDA PASSADA · O QUE A PRIMEIRA AINDA DEIXAVA MENTIR ────────────────
 *
 * 1. CONTADOR QUE DÁ FALSO ALARME. "Parada recomendada" e "Candidatos a
 *    vencedor" contavam por `recommendation` SEM olhar o status. A leitura é o
 *    último checkpoint e ele não se apaga quando o teste acaba: um experimento
 *    `completed`/`stopped`/`cancelled` continuava somando na FILA DE DECISÃO —
 *    o diretor via "2 para parar", abria, e os dois já estavam parados. Fila é
 *    a camada de decisão; número que chama para uma ação que não existe é o
 *    pior lugar possível para um falso positivo. Agora as duas contagens (e a
 *    ordenação) só consideram quem está EM CAMPO (`running`/`paused`), que é
 *    onde ainda há verba correndo e decisão a tomar.
 *
 * 2. O BURACO QUE NINGUÉM CONTAVA: teste em campo SEM leitura nenhuma. Verba
 *    queimando sem medição é decisão, não auditoria — e não aparecia em lugar
 *    nenhum da fila. Entra como contador próprio e como faixa de urgência
 *    ACIMA de "pronto para iniciar": dinheiro correndo às cegas pesa mais que
 *    plano parado na gaveta.
 *
 * 3. BARRA SEM LASTRO DE AMOSTRA. O comparador ordenava por lift e o maior
 *    ganho podia ser justamente o de amostra insuficiente — `sampleReady`
 *    existia no assessment, o card já o mostrava em chip, e o GRÁFICO (onde a
 *    ordenação convida a escolher o primeiro) não dizia nada. Cada linha ganha
 *    o status e o "amostra insuficiente" em texto, não em cor: alfa baixo numa
 *    barra cairia abaixo de 3:1 para elemento gráfico, e a régua de contraste
 *    vale nos dois temas.
 *
 * 4. RÓTULO REPETIDO. "N ciclo(s) Andromeda aprovado(s)" aparecia TRÊS vezes
 *    (sublinha do painel, contador próprio e resumo do formulário). O contador
 *    virou o de "em campo sem leitura"; o número segue na sublinha e no resumo,
 *    onde ele tem trabalho diferente (lá ele é o "sem lastro" da criação).
 *    E `comLeitura` ganhou denominador: "3 de 11", não "3".
 *
 * 5. O FORMULÁRIO DECIDIA PELO DIRETOR. `primaryMetric`, `guardrailMetric` e os
 *    quatro limites de parada iam para a rota como CONSTANTE literal do estado
 *    — todo plano nascia com a mesma métrica e a mesma janela. E o card já
 *    imprimia `metricLabels[x.primary_metric]`, preparado para uma variação que
 *    o formulário não sabia produzir: numa tela cujo trabalho é COMPARAR, o
 *    campo comparado era fixo. Os seis viraram campo, com os limites da rota
 *    (mín. 30 leads/braço, 7–45 dias, piora ≤100%) no `min`/`max`.
 */

type Cycle = { id: string; readiness_score: number; created_at: string };
type ExperimentEvent = {
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  reason: string;
  created_at: string;
};
/* Tudo `unknown`: nenhum campo do assessment é garantido, e o portão contra
   número inventado é ler cada um por `numeroOuNulo` — que devolve NULO, não
   zero. Zero parece saudável; nulo diz a verdade. */
type Assessment = Record<string, unknown>;
type Experiment = {
  id: string;
  name: string;
  hypothesis: string;
  platform: string;
  single_variable: string;
  control_key?: string | null;
  test_key?: string | null;
  primary_metric: string;
  guardrail_metric: string;
  budget_cap: number;
  daily_budget_cap: number;
  minimum_leads_per_arm?: number | null;
  minimum_days?: number | null;
  maximum_days?: number | null;
  maximum_guardrail_increase_percent?: number | null;
  external_experiment_key?: string | null;
  status: string;
  latestCheckpoint?: { assessment: Assessment; created_at?: string } | null;
  events?: ExperimentEvent[];
};
type Payload = { experiments: Experiment[]; approvedCycles: Cycle[] };

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numeroOuNulo = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const dinheiro = (v: unknown) => {
  const n = numeroOuNulo(v);
  return n === null ? null : brl.format(n);
};
const porcento = (v: number) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const porcentoComSinal = (v: number) => `${v > 0 ? "+" : ""}${porcento(v)}`;
const dataCurta = (v: unknown) => {
  const d = typeof v === "string" && v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : null;
};

const platformLabels: Record<string, string> = {
  meta: "Meta",
  google_ads: "Google",
  youtube: "YouTube",
  tiktok_ads: "TikTok",
  portal: "Portal",
};
const variableLabels: Record<string, string> = {
  audience: "Público",
  creative: "Criativo",
  placement: "Posicionamento",
  optimization_event: "Evento de otimização",
};
const metricLabels: Record<string, string> = {
  qualified_lead_rate: "taxa de lead qualificado",
  visit_rate: "taxa de visita",
  proposal_rate: "taxa de proposta",
  win_rate: "taxa de fechamento",
  cpl: "CPL",
  invalid_contact_rate: "contato inválido",
  opt_out_rate: "descadastro",
  complaint_rate: "reclamação",
};
/* As duas listas que a rota aceita, separadas exatamente como ela valida
   (`metrics` e `guards` em POST /api/v1/marketing/experiments). O formulário
   mandava as duas cravadas no estado; agora o diretor escolhe. */
const primaryMetricOptions = ["qualified_lead_rate", "visit_rate", "proposal_rate", "win_rate"];
const guardrailMetricOptions = ["cpl", "invalid_contact_rate", "opt_out_rate", "complaint_rate"];
/* Onde ainda há verba correndo — e, portanto, decisão a tomar. Fora daqui a
   leitura do último checkpoint é histórico, não chamado. */
const EM_CAMPO = new Set(["running", "paused"]);
type Tom = "warning" | "success" | "danger" | "neutral" | "info";
const experimentStatus: Record<string, { label: string; tone: Tom }> = {
  draft: { label: "Aguardando decisão", tone: "warning" },
  approved: { label: "Aprovado", tone: "info" },
  running: { label: "Em campo", tone: "success" },
  paused: { label: "Pausado", tone: "warning" },
  completed: { label: "Concluído", tone: "neutral" },
  /* `stopped` e `cancelled` existem no CHECK da tabela e caíam no fallback:
     o diretor lia a chave crua em inglês. */
  stopped: { label: "Interrompido", tone: "danger" },
  cancelled: { label: "Cancelado", tone: "neutral" },
  rejected: { label: "Rejeitado", tone: "danger" },
};
/* As cinco leituras que `evaluateMediaExperiment` devolve. `tinta` é o token
   que pinta a barra do comparador; `classe` é o indicador de estado já
   auditado nos dois temas (cc6-ok 5,37 · cc6-warn 4,91 · cc6-crit 6,15 dentro
   de `.cc6-panel` claro) — e nunca acompanhado de `cc6-num`, que os repinta. */
const leituraLabels: Record<string, { label: string; tone: Tom; tinta: string; classe: string }> = {
  stop_review: {
    label: "Parada recomendada",
    tone: "danger",
    tinta: "var(--atlas-estado-perigo)",
    classe: "cc6-crit",
  },
  candidate_winner_review: {
    label: "Candidato a vencedor",
    tone: "success",
    tinta: "var(--atlas-estado-sucesso)",
    classe: "cc6-ok",
  },
  candidate_loser_review: {
    label: "Candidato a perdedor",
    tone: "warning",
    tinta: "var(--atlas-estado-atencao)",
    classe: "cc6-warn",
  },
  continue_collecting: {
    label: "Ainda coletando",
    tone: "info",
    tinta: "var(--atlas-accent)",
    classe: "text-[var(--atlas-texto-medio)]",
  },
  inconclusive_review: {
    label: "Sem diferença clara",
    tone: "neutral",
    tinta: "var(--atlas-texto-fraco)",
    classe: "text-[var(--atlas-texto-medio)]",
  },
};
const stopReasonLabels: Record<string, string> = {
  budget_cap_reached: "teto de investimento atingido",
  maximum_window_reached: "janela máxima atingida",
  guardrail_deteriorated: "métrica de proteção piorou",
};
const interpretationLabels: Record<string, string> = {
  directional_result_requires_director_review: "resultado direcional — a leitura causal é sua, não do sistema",
  insufficient_sample_no_causal_claim: "amostra insuficiente — nenhuma afirmação causal é permitida",
};
/* `event_type` é gravado pelas RPCs como a própria decisão/transição. */
const eventoLabels: Record<string, string> = {
  approved: "plano aprovado",
  rejected: "plano rejeitado",
  start: "início externo registrado",
  pause: "pausado",
  resume: "retomado",
  stop: "interrompido",
  complete: "concluído",
};

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";
const field = `w-full rounded-xl border border-[rgba(148,163,184,.16)] bg-white/[.03] p-3 text-sm text-[var(--atlas-texto-forte)] transition-colors placeholder:text-[var(--atlas-texto-fraco)] hover:border-[rgba(148,163,184,.26)] ${focusRing}`;
/* Alvo de 44px (min-h-11): estes três são os botões que DECIDEM — aprovar,
   rejeitar, pausar — e mediam 33px. `cc6-ghost-btn` já nascia com 44. */
const btnBase = "inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40";
const btnAccent = `${btnBase} border border-[rgba(75,141,248,.45)] bg-[rgba(75,141,248,.12)] text-[var(--atlas-texto-forte)] hover:bg-[rgba(75,141,248,.2)] ${focusRing}`;
const btnOk = `${btnBase} border border-[rgba(52,211,153,.35)] bg-[rgba(52,211,153,.1)] text-[var(--atlas-estado-sucesso)] hover:bg-[rgba(52,211,153,.18)] ${focusRing}`;
const btnWarn = `${btnBase} border border-[rgba(245,181,68,.4)] bg-[rgba(245,181,68,.1)] text-[var(--atlas-estado-atencao)] hover:bg-[rgba(245,181,68,.18)] ${focusRing}`;
const btnGhost = "cc6-ghost-btn disabled:cursor-not-allowed disabled:opacity-40";
const rotuloCampo = "block pb-1 text-micro uppercase leading-4 tracking-[0.12em] text-[var(--atlas-texto-fraco)]";

/* Um rótulo, um número — a única forma de cifra da tela. Sem `cc6-num`: em
   tema claro ele venceria a cor e pintaria tudo de laranja. */
function Cifra({ rotulo, valor, classe }: { rotulo: string; valor: string; classe?: string }) {
  return (
    <div className="min-w-0">
      <p className={rotuloCampo}>{rotulo}</p>
      <p className={`cc6-metric-value text-numero leading-none tabular-nums ${classe ?? ""}`}>{valor}</p>
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className={rotuloCampo}>{rotulo}</span>
      {children}
    </label>
  );
}

const recomendacaoDe = (x: Experiment) =>
  x.latestCheckpoint ? String(x.latestCheckpoint.assessment?.recommendation ?? "") : "";
const leituraDe = (x: Experiment) => leituraLabels[recomendacaoDe(x)] ?? null;

export default function MediaExperimentsPage() {
  const [data, setData] = useState<Payload | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    learningCycleId: "",
    name: "",
    hypothesis: "",
    platform: "meta",
    singleVariable: "audience",
    controlKey: "controle-atual",
    testKey: "teste-novo",
    primaryMetric: "qualified_lead_rate",
    guardrailMetric: "cpl",
    budgetCap: "2000",
    dailyBudgetCap: "200",
    minimumLeadsPerArm: "50",
    minimumDays: "7",
    maximumDays: "21",
    maximumGuardrailIncreasePercent: "20",
  });
  const load = useCallback(async () => {
    const r = await fetch("/api/v1/marketing/experiments", { cache: "no-store" }),
      j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "Indisponível");
    setData(j.data);
    setForm((f) => ({ ...f, learningCycleId: f.learningCycleId || j.data.approvedCycles?.[0]?.id || "" }));
  }, []);
  useEffect(() => {
    load().catch((e) => setNotice(e.message));
  }, [load]);
  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch("/api/v1/marketing/experiments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || "Ação recusada");
      setNotice("Ação registrada; nenhuma campanha foi alterada automaticamente.");
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Falha");
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    await act({
      action: "create",
      ...form,
      ...Object.fromEntries(
        ["budgetCap", "dailyBudgetCap", "minimumLeadsPerArm", "minimumDays", "maximumDays", "maximumGuardrailIncreasePercent"].map(
          (k) => [k, Number(form[k as keyof typeof form])],
        ),
      ),
    });
  }

  const experimentos = data?.experiments ?? [];
  const drafts = experimentos.filter((x) => x.status === "draft").length;
  const readyToStart = experimentos.filter((x) => x.status === "approved").length;
  const running = experimentos.filter((x) => x.status === "running").length;
  /* A leitura sobrevive ao fim do teste: o último checkpoint continua dizendo
     "stop_review" depois de o experimento ter sido parado. Contar por
     `recommendation` sem olhar o status enchia a FILA DE DECISÃO de chamados
     para uma ação que já foi tomada. As duas contagens abaixo são sobre quem
     está em campo — nada é escondido, a lista inteira segue no rolo. */
  const emCampo = experimentos.filter((x) => EM_CAMPO.has(x.status));
  const paraParar = emCampo.filter((x) => recomendacaoDe(x) === "stop_review").length;
  const candidatos = emCampo.filter((x) => recomendacaoDe(x) === "candidate_winner_review").length;
  const semLeitura = emCampo.filter((x) => !x.latestCheckpoint).length;
  const comLeitura = experimentos.filter((x) => x.latestCheckpoint).length;

  /* ORDENA, NUNCA FILTRA. O que espera assinatura vem primeiro; dentro de cada
     faixa o `sort` estável preserva o `created_at desc` que a rota já devolve.
     A contagem total fica visível para provar que nenhuma linha sumiu. */
  const urgencia = (x: Experiment) => {
    const ativo = EM_CAMPO.has(x.status);
    const rec = ativo ? recomendacaoDe(x) : "";
    if (x.status === "draft") return 0;
    if (rec === "stop_review") return 1;
    if (rec === "candidate_winner_review" || rec === "candidate_loser_review") return 2;
    /* Verba correndo sem nenhuma medição pesa mais que plano parado na gaveta. */
    if (ativo && !x.latestCheckpoint) return 3;
    if (x.status === "approved") return 4;
    if (ativo) return 5;
    return 6;
  };
  const lista = [...experimentos].sort((a, b) => urgencia(a) - urgencia(b));

  /* Série do comparador: só experimento com lift REAL no assessment. Nada é
     preenchido com zero — sem lift, a linha simplesmente não entra no gráfico,
     e o card continua na lista com o texto do que falta. */
  const serie = experimentos
    .map((x) => ({ x, lift: numeroOuNulo(x.latestCheckpoint?.assessment?.relativeLiftPercent) }))
    .filter((r): r is { x: Experiment; lift: number } => r.lift !== null)
    .sort((a, b) => b.lift - a.lift);
  const dominio = serie.length ? Math.max(...serie.map((r) => Math.abs(r.lift))) : 0;
  const VISIVEIS = 8;

  /* O que a barra sozinha não conta. `sampleReady` já vinha no assessment e o
     card já o exibia em chip — só o GRÁFICO ficava calado, justamente onde a
     ordenação por lift convida a escolher o primeiro da lista. Vai como TEXTO,
     não como cor ou alfa: rebaixar a barra a 30% de opacidade a derrubaria
     abaixo de 3:1 para elemento gráfico, e a régua vale nos dois temas. */
  const contextoDaLinha = (x: Experiment) =>
    [
      x.status === "running" ? null : (experimentStatus[x.status]?.label ?? x.status).toLowerCase(),
      x.latestCheckpoint?.assessment?.sampleReady === true ? null : "amostra insuficiente",
    ].filter(Boolean) as string[];

  const linhaComparador = ({ x, lift }: { x: Experiment; lift: number }) => {
    const leitura = leituraDe(x);
    const largura = dominio > 0 ? (Math.abs(lift) / dominio) * 50 : 0;
    const contexto = contextoDaLinha(x);
    return (
      <li key={x.id} className="grid grid-cols-[minmax(0,1fr)_minmax(88px,32%)_auto] items-center gap-x-3 gap-y-1">
        <span className="min-w-0 text-corpo leading-5 text-[var(--atlas-texto-medio)]">
          {x.name}
          {contexto.length ? (
            <span className="text-micro leading-4 text-[var(--atlas-texto-fraco)]"> · {contexto.join(" · ")}</span>
          ) : null}
        </span>
        <svg
          viewBox="0 0 100 8"
          preserveAspectRatio="none"
          className="h-2.5 w-full"
          role="img"
          aria-label={`${x.name}: lift relativo de ${porcentoComSinal(lift)} sobre o controle${
            contexto.length ? ` — ${contexto.join(", ")}` : ""
          }`}
        >
          <rect
            x="49.6"
            y="0"
            width="0.8"
            height="8"
            fill="color-mix(in srgb, var(--atlas-texto-fraco) 70%, transparent)"
          />
          <rect
            x={lift >= 0 ? 50 : 50 - largura}
            y="1.4"
            width={Math.max(largura, 0.8)}
            height="5.2"
            rx="0.7"
            fill={`color-mix(in srgb, ${leitura?.tinta ?? "var(--atlas-accent)"} 88%, transparent)`}
          >
            <title>{`${x.name} · ${porcentoComSinal(lift)} · ${leitura?.label ?? "leitura registrada"}${
              contexto.length ? ` · ${contexto.join(" · ")}` : ""
            }`}</title>
          </rect>
        </svg>
        <span className={`text-rotulo leading-5 tabular-nums ${leitura?.classe ?? "text-[var(--atlas-texto-medio)]"}`}>
          {porcentoComSinal(lift)}
        </span>
      </li>
    );
  };

  return (
    <div data-phase="93-governed-media-experiment-lab" className="space-y-4 pb-10">
      <PageHeader
        eyebrow="Marketing · Experimentos"
        title="Laboratório de mídia"
        description="Uma variável por vez, grupo de controle obrigatório, teto de investimento e parada antecipada — o resultado é direcional; quem decide é a diretoria."
      />

      {notice ? (
        <div
          role="status"
          className="cc6-panel cc6-sev-band cc6-reveal p-4 pl-5 text-sm leading-6 text-[var(--atlas-texto-medio)]"
          style={{ "--cc6-sev": "var(--atlas-accent)" } as CSSProperties}
        >
          {notice}
        </div>
      ) : null}

      {/* 1º na hierarquia — e num painel só, porque a fila e a comparação
          respondem a mesma pergunta: em que eu mexo agora. */}
      <section aria-label="Fila de decisão e comparação dos experimentos">
        <TiltShell className="cc6-panel cc6-reveal p-5" delayMs={40}>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="cc6-eyebrow">Fila de decisão</p>
              <p className="text-micro leading-4 tabular-nums text-[var(--atlas-texto-fraco)]">
                {data
                  ? `${comLeitura} de ${experimentos.length} plano(s) com leitura registrada · ${data.approvedCycles.length} ciclo(s) Andromeda aprovado(s)`
                  : "—"}
              </p>
            </div>
            <StatusBadge tone="info">Sem vencedor automático</StatusBadge>
          </div>

          {/* MEDIDO NO NAVEGADOR, 1280×900, com a página renderizada e o CSS de
              produção: o herói escrevia NÚMERO-e-depois-RÓTULO enquanto toda
              `Cifra` ao lado escrevia RÓTULO-e-depois-NÚMERO. Com `items-end`,
              o que encostava na linha de base era o rótulo do herói contra os
              números dos vizinhos — a régua não alinhava nada. Mesma ordem para
              os seis resolve, e aí `items-end` passa a alinhar de fato os
              números, que é o que se compara. */}
          <div className="mt-4 flex flex-wrap items-end gap-x-9 gap-y-4" aria-busy={!data}>
            <div className="min-w-0">
              <p className="block pb-1 text-micro uppercase leading-4 tracking-[0.12em] text-[var(--atlas-texto-fraco)]">
                Aguardando sua decisão
              </p>
              <p className={`cc6-metric-value text-heroi leading-none tabular-nums ${drafts ? "cc6-warn" : ""}`}>
                {data ? drafts : "—"}
              </p>
            </div>
            {/* Os dois abaixo contam SÓ quem está em campo: a leitura sobrevive
                ao fim do teste, e chamar para parar o que já parou é falso
                alarme na única camada que não pode ter nenhum. O recorte está
                na linha logo abaixo, e não no rótulo: "…em campo" repetido duas
                vezes estourava a régua para uma segunda linha e deixava "Em
                campo · 3" órfão embaixo. */}
            <Cifra
              rotulo="Parada recomendada"
              valor={data ? String(paraParar) : "—"}
              classe={paraParar ? "cc6-crit" : undefined}
            />
            <Cifra
              rotulo="Candidato a vencedor"
              valor={data ? String(candidatos) : "—"}
              classe={candidatos ? "cc6-ok" : undefined}
            />
            {/* Verba correndo sem nenhuma medição — não existia contador para
                isto, e é decisão: ou chega checkpoint, ou o teste pausa. */}
            <Cifra
              rotulo="Em campo sem leitura"
              valor={data ? String(semLeitura) : "—"}
              classe={semLeitura ? "cc6-warn" : undefined}
            />
            <Cifra rotulo="Prontos para iniciar" valor={data ? String(readyToStart) : "—"} />
            <Cifra rotulo="Em campo" valor={data ? String(running) : "—"} classe={running ? "cc6-ok" : undefined} />
          </div>
          {data ? (
            <p className="mt-2 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
              Parada recomendada e candidato a vencedor contam só quem está em campo — leitura de teste já encerrado
              é histórico, não chamado. Os encerrados seguem na lista e no comparador abaixo.
            </p>
          ) : null}

          {!data ? (
            <p className="cc6-warn mt-4 text-corpo leading-5">
              {notice
                ? "sem lastro — a rota de experimentos não respondeu; os números e a comparação só aparecem quando ela voltar."
                : "carregando os planos e as leituras já registradas…"}
            </p>
          ) : (
            <div className="cc6-hairline mt-4 pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="cc6-eyebrow">Lift relativo · controle × teste</p>
                {serie.length > 1 ? (
                  <p className="text-micro leading-4 tabular-nums text-[var(--atlas-texto-fraco)]">
                    escala ±{porcento(dominio)} · linha central = empate com o controle
                  </p>
                ) : null}
              </div>
              {serie.length > 1 ? (
                <>
                  <ul className="mt-3 space-y-2">{serie.slice(0, VISIVEIS).map(linhaComparador)}</ul>
                  {serie.length > VISIVEIS ? (
                    <details className="group mt-2">
                      <summary className="cc6-eyebrow flex min-h-11 cursor-pointer list-none select-none items-center [&::-webkit-details-marker]:hidden">
                        mais {serie.length - VISIVEIS} leitura(s)
                        <span
                          aria-hidden="true"
                          className="ml-2 inline-block text-[var(--atlas-texto-fraco)] transition-transform group-open:rotate-180"
                        >
                          ▾
                        </span>
                      </summary>
                      <ul className="space-y-2 pb-1">{serie.slice(VISIVEIS).map(linhaComparador)}</ul>
                    </details>
                  ) : null}
                </>
              ) : (
                <p className="cc6-warn mt-2 text-corpo leading-5">
                  sem lastro — comparar exige lift medido em pelo menos dois experimentos, e hoje há {serie.length}.
                  O lift nasce do checkpoint: envie leitura pela rota para cada teste em campo.
                </p>
              )}
            </div>
          )}
        </TiltShell>
      </section>

      {/* 2º na hierarquia: cada experimento com sua transição de governança.
          Largura inteira agora que o formulário desceu — o mesmo card cabe
          muito mais número por pixel, e a hipótese para de quebrar em 5 linhas. */}
      <section aria-label="Experimentos" className="space-y-3">
        {data ? (
          <p className="text-micro leading-4 text-[var(--atlas-texto-fraco)]">
            {experimentos.length} plano(s), ordenados por urgência de decisão — nada está filtrado.
          </p>
        ) : null}
        {lista.map((x, index) => {
          const status = experimentStatus[x.status] ?? { label: x.status, tone: "neutral" as const };
          const a: Assessment = x.latestCheckpoint?.assessment ?? {};
          const leitura = leituraDe(x);
          const interpretationKey = String(a.interpretation ?? "");
          const interpretation = interpretationLabels[interpretationKey] ?? interpretationKey;
          const controle = numeroOuNulo(a.controlConversionRate);
          const teste = numeroOuNulo(a.testConversionRate);
          const lift = numeroOuNulo(a.relativeLiftPercent);
          const liftAbs = numeroOuNulo(a.absoluteLiftPercentPoints);
          const protecao = numeroOuNulo(a.guardrailIncreasePercent);
          const gasto = numeroOuNulo(a.totalSpend);
          const teto = numeroOuNulo(x.budget_cap);
          const tetoProtecao = numeroOuNulo(x.maximum_guardrail_increase_percent);
          const consumo = gasto !== null && teto !== null && teto > 0 ? (gasto / teto) * 100 : null;
          const motivos = Array.isArray(a.stopReasons) ? (a.stopReasons as unknown[]).map(String) : [];
          const eventos = x.events ?? [];
          const lidoEm = dataCurta(x.latestCheckpoint?.created_at);
          const protecaoClasse =
            protecao === null
              ? undefined
              : tetoProtecao !== null && protecao > tetoProtecao
                ? "cc6-crit"
                : protecao > 0
                  ? "cc6-warn"
                  : "cc6-ok";
          return (
            <article
              key={x.id}
              className="cc6-panel cc6-reveal p-5 transition-colors hover:border-[rgba(148,163,184,.22)]!"
              style={{ animationDelay: `${160 + Math.min(index, 6) * 50}ms` }}
            >
              <div className="flex flex-wrap justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    {leitura ? <StatusBadge tone={leitura.tone}>{leitura.label}</StatusBadge> : null}
                    <span className="cc6-chip">{platformLabels[x.platform] ?? x.platform}</span>
                    <span className="cc6-chip">{variableLabels[x.single_variable] ?? x.single_variable}</span>
                    {x.latestCheckpoint ? (
                      <span className="cc6-chip">
                        {a.sampleReady === true ? "amostra suficiente" : "amostra insuficiente"}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-2 text-lg font-semibold tracking-tight text-[var(--atlas-texto-forte)]">{x.name}</h3>
                  <p className="mt-1.5 text-corpo leading-6 text-[var(--atlas-texto-medio)]">{x.hypothesis}</p>
                </div>
                {x.status === "draft" && (
                  <div className="flex flex-wrap content-start gap-2">
                    <button
                      disabled={busy}
                      onClick={() =>
                        act({
                          action: "decide",
                          experimentId: x.id,
                          decision: "approved",
                          reason: "Plano controlado revisado e autorizado pela diretoria.",
                        })
                      }
                      className={btnOk}
                    >
                      Aprovar plano
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        act({
                          action: "decide",
                          experimentId: x.id,
                          decision: "rejected",
                          reason: "Plano rejeitado pela diretoria por risco ou evidência insuficiente.",
                        })
                      }
                      className={btnGhost}
                    >
                      Rejeitar
                    </button>
                  </div>
                )}
                {x.status === "approved" && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      const externalKey = prompt("Identificador do experimento criado na plataforma:");
                      if (externalKey)
                        act({
                          action: "transition",
                          experimentId: x.id,
                          transition: "start",
                          externalKey,
                          reason: "Execução externa conferida e início registrado pela diretoria.",
                        });
                    }}
                    className={`self-start ${btnAccent}`}
                  >
                    Registrar início externo
                  </button>
                )}
                {["running", "paused"].includes(x.status) && (
                  <div className="flex flex-wrap content-start gap-2">
                    <button
                      disabled={busy}
                      onClick={() =>
                        act({
                          action: "transition",
                          experimentId: x.id,
                          transition: x.status === "running" ? "pause" : "resume",
                          reason: "Transição operacional revisada e registrada pela diretoria.",
                        })
                      }
                      className={btnWarn}
                    >
                      {x.status === "running" ? "Pausar" : "Retomar"}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        act({
                          action: "transition",
                          experimentId: x.id,
                          transition: "complete",
                          reason: "Janela concluída; resultado seguirá para revisão humana.",
                        })
                      }
                      className={btnGhost}
                    >
                      Concluir
                    </button>
                  </div>
                )}
              </div>

              {/* A leitura, sem caixa dentro de caixa: um filete separa, e os
                  dois braços aparecem lado a lado — que é a comparação que a
                  tela existia para fazer e não fazia. */}
              {x.latestCheckpoint ? (
                <div className="cc6-hairline mt-4 pt-4">
                  <div className="flex flex-wrap gap-x-9 gap-y-4">
                    <Cifra
                      rotulo={`Controle · ${metricLabels[x.primary_metric] ?? x.primary_metric}`}
                      valor={controle === null ? "sem lastro" : porcento(controle)}
                      classe={controle === null ? "cc6-warn text-corpo!" : undefined}
                    />
                    <Cifra
                      rotulo={`Teste · ${metricLabels[x.primary_metric] ?? x.primary_metric}`}
                      valor={teste === null ? "sem lastro" : porcento(teste)}
                      classe={teste === null ? "cc6-warn text-corpo!" : undefined}
                    />
                    <Cifra
                      rotulo="Lift relativo"
                      valor={lift === null ? "sem lastro" : porcentoComSinal(lift)}
                      classe={lift === null ? "cc6-warn text-corpo!" : leitura?.classe}
                    />
                    <Cifra
                      rotulo={`Proteção · ${metricLabels[x.guardrail_metric] ?? x.guardrail_metric}`}
                      valor={protecao === null ? "sem lastro" : porcentoComSinal(protecao)}
                      classe={protecao === null ? "cc6-warn text-corpo!" : protecaoClasse}
                    />
                    <Cifra
                      rotulo="Gasto sobre o teto"
                      valor={
                        gasto === null || teto === null
                          ? "sem lastro"
                          : `${dinheiro(gasto)} de ${dinheiro(teto)}`
                      }
                      classe={
                        gasto === null || teto === null
                          ? "cc6-warn text-corpo!"
                          : `text-corpo! ${consumo !== null && consumo >= 100 ? "cc6-crit" : ""}`
                      }
                    />
                  </div>
                  <p className="mt-3 text-rotulo leading-5 tabular-nums text-[var(--atlas-texto-fraco)]">
                    {[
                      liftAbs === null ? null : `${porcentoComSinal(liftAbs)} em pontos percentuais`,
                      consumo === null ? null : `${porcento(consumo)} do teto consumido`,
                      protecao !== null && tetoProtecao !== null
                        ? `limite de piora da proteção +${porcento(tetoProtecao)}`
                        : null,
                      lidoEm ? `leitura de ${lidoEm}` : null,
                      interpretation || null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {motivos.length ? (
                    <p className="cc6-crit mt-2 text-corpo leading-5">
                      Regra de parada disparada: {motivos.map((m) => stopReasonLabels[m] ?? m).join(" · ")}.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="cc6-hairline mt-4 pt-4 text-corpo leading-5 text-[var(--atlas-texto-fraco)]">
                  Sem leitura registrada — controle, teste e lift aparecem quando o primeiro checkpoint deste
                  experimento chegar pela rota.
                </p>
              )}

              {/* Os limites que o diretor preencheu no formulário e nunca mais
                  via. Para um rascunho eles SÃO o objeto da decisão — por isso
                  ficam à vista, e não recolhidos. */}
              <p className="mt-3 text-micro leading-4 tabular-nums text-[var(--atlas-texto-fraco)]">
                {[
                  x.control_key && x.test_key ? `controle "${x.control_key}" × teste "${x.test_key}"` : null,
                  `métrica primária ${metricLabels[x.primary_metric] ?? x.primary_metric}`,
                  `proteção ${metricLabels[x.guardrail_metric] ?? x.guardrail_metric}`,
                  dinheiro(x.budget_cap) ? `teto total ${dinheiro(x.budget_cap)}` : null,
                  dinheiro(x.daily_budget_cap) ? `teto diário ${dinheiro(x.daily_budget_cap)}` : null,
                  numeroOuNulo(x.minimum_leads_per_arm) === null
                    ? null
                    : `mínimo ${x.minimum_leads_per_arm} leads por braço`,
                  numeroOuNulo(x.minimum_days) === null || numeroOuNulo(x.maximum_days) === null
                    ? null
                    : `janela de ${x.minimum_days} a ${x.maximum_days} dias`,
                  x.external_experiment_key ? `id externo ${x.external_experiment_key}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>

              {/* AUDITORIA — desce para camada recolhível. A rota já mandava
                  `events` e a tela descartava a trilha inteira. */}
              {eventos.length ? (
                <details className="group mt-2">
                  <summary className="cc6-eyebrow flex min-h-11 cursor-pointer list-none select-none items-center [&::-webkit-details-marker]:hidden">
                    trilha de governança · {eventos.length} registro(s)
                    <span
                      aria-hidden="true"
                      className="ml-2 inline-block text-[var(--atlas-texto-fraco)] transition-transform group-open:rotate-180"
                    >
                      ▾
                    </span>
                  </summary>
                  <ul className="space-y-1.5 pb-1">
                    {eventos.map((ev, i) => (
                      <li key={`${x.id}-${ev.created_at}-${i}`} className="text-rotulo leading-5 text-[var(--atlas-texto-medio)]">
                        <span className="tabular-nums text-[var(--atlas-texto-fraco)]">{dataCurta(ev.created_at) ?? "—"}</span>
                        {" · "}
                        {eventoLabels[ev.event_type] ?? ev.event_type}
                        {ev.from_status && ev.to_status
                          ? ` (${experimentStatus[ev.from_status]?.label ?? ev.from_status} → ${
                              experimentStatus[ev.to_status]?.label ?? ev.to_status
                            })`
                          : ""}
                        {ev.reason ? ` — ${ev.reason}` : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </article>
          );
        })}
        {data && !experimentos.length ? (
          /* Uma primitiva só: `cc6-panel-quiet` solto no primeiro nível era a
             segunda superfície da tela, e sem painel em volta ela nem ganha o
             tratamento de aninhamento que justifica existir. */
          <p
            className="cc6-panel cc6-reveal p-6 text-center text-corpo leading-6 text-[var(--atlas-texto-fraco)]"
            style={{ animationDelay: "160ms" }}
          >
            Aprove um ciclo Andromeda antes de planejar o primeiro teste.
          </p>
        ) : null}
      </section>

      {/* ENTRADA — desce para a camada recolhível nativa que /marketing,
          /tasks e o Lead 360 já usam. Os 9 campos e o botão continuam todos
          aqui; o que mudou é que eles pararam de comer 640px da primeira tela
          e passaram a ter rótulo visível. */}
      <details className="cc6-panel cc6-reveal group" style={{ animationDelay: "220ms" }}>
        <summary className="flex min-h-11 cursor-pointer list-none select-none flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3.5 [&::-webkit-details-marker]:hidden">
          <span className="cc6-eyebrow">Novo plano controlado</span>
          <span className="flex items-center gap-2 text-rotulo leading-5 text-[var(--atlas-texto-medio)]">
            {data && !data.approvedCycles.length
              ? "sem lastro — nenhum ciclo Andromeda aprovado para ancorar um plano"
              : `${data ? data.approvedCycles.length : "—"} ciclo(s) Andromeda aprovado(s) para ancorar o plano`}
            <span
              aria-hidden="true"
              className="inline-block text-[var(--atlas-texto-fraco)] transition-transform group-open:rotate-180"
            >
              ▾
            </span>
          </span>
        </summary>
        <form onSubmit={submit} className="cc6-hairline grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Campo rotulo="Ciclo Andromeda aprovado">
            <select
              aria-label="Ciclo Andromeda aprovado"
              required
              value={form.learningCycleId}
              onChange={(e) => setForm({ ...form, learningCycleId: e.target.value })}
              className={field}
            >
              <option className="text-slate-900" value="">
                Ciclo Andromeda aprovado
              </option>
              {data?.approvedCycles.map((c) => (
                <option className="text-slate-900" key={c.id} value={c.id}>
                  Prontidão {c.readiness_score}% · {new Date(c.created_at).toLocaleDateString("pt-BR")}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Nome do experimento">
            <input
              aria-label="Nome do experimento"
              required
              minLength={3}
              placeholder="Nome do experimento"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={field}
            />
          </Campo>
          <Campo rotulo="Plataforma">
            <select
              aria-label="Plataforma"
              value={form.platform}
              onChange={(e) => setForm({ ...form, platform: e.target.value })}
              className={field}
            >
              {Object.entries(platformLabels).map(([value, label]) => (
                <option className="text-slate-900" key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Variável isolada">
            <select
              aria-label="Variável isolada"
              value={form.singleVariable}
              onChange={(e) => setForm({ ...form, singleVariable: e.target.value })}
              className={field}
            >
              {Object.entries(variableLabels).map(([value, label]) => (
                <option className="text-slate-900" key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Campo>
          <div className="sm:col-span-2 lg:col-span-4">
            <Campo rotulo="Hipótese — uma variável, um efeito esperado, um porquê">
              <textarea
                aria-label="Hipótese"
                required
                minLength={20}
                placeholder="Se alterarmos uma variável, esperamos... porque..."
                value={form.hypothesis}
                onChange={(e) => setForm({ ...form, hypothesis: e.target.value })}
                className={`min-h-20 ${field}`}
              />
            </Campo>
          </div>
          <Campo rotulo="Identificador do controle">
            <input
              aria-label="Identificador do controle"
              value={form.controlKey}
              onChange={(e) => setForm({ ...form, controlKey: e.target.value })}
              className={field}
              placeholder="Controle"
            />
          </Campo>
          <Campo rotulo="Identificador do teste">
            <input
              aria-label="Identificador do teste"
              value={form.testKey}
              onChange={(e) => setForm({ ...form, testKey: e.target.value })}
              className={field}
              placeholder="Teste"
            />
          </Campo>
          <Campo rotulo="Teto total (R$)">
            <input
              type="number"
              min="1"
              value={form.budgetCap}
              onChange={(e) => setForm({ ...form, budgetCap: e.target.value })}
              className={`tabular-nums ${field}`}
              aria-label="Teto total"
            />
          </Campo>
          <Campo rotulo="Teto diário (R$)">
            <input
              type="number"
              min="1"
              value={form.dailyBudgetCap}
              onChange={(e) => setForm({ ...form, dailyBudgetCap: e.target.value })}
              className={`tabular-nums ${field}`}
              aria-label="Teto diário"
            />
          </Campo>
          {/* Estes seis iam para a rota como CONSTANTE do estado: todo plano
              nascia com a mesma métrica e a mesma janela. Numa tela cujo
              trabalho é COMPARAR, o campo comparado não pode ser fixo — e o
              card já imprimia `metricLabels[x.primary_metric]`, preparado para
              a variação que o formulário não sabia produzir. */}
          <Campo rotulo="Métrica primária — o que o teste tenta melhorar">
            <select
              aria-label="Métrica primária"
              value={form.primaryMetric}
              onChange={(e) => setForm({ ...form, primaryMetric: e.target.value })}
              className={field}
            >
              {primaryMetricOptions.map((value) => (
                <option className="text-slate-900" key={value} value={value}>
                  {metricLabels[value] ?? value}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Métrica de proteção — o que não pode piorar">
            <select
              aria-label="Métrica de proteção"
              value={form.guardrailMetric}
              onChange={(e) => setForm({ ...form, guardrailMetric: e.target.value })}
              className={field}
            >
              {guardrailMetricOptions.map((value) => (
                <option className="text-slate-900" key={value} value={value}>
                  {metricLabels[value] ?? value}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Mínimo de leads por braço">
            <input
              type="number"
              min="30"
              value={form.minimumLeadsPerArm}
              onChange={(e) => setForm({ ...form, minimumLeadsPerArm: e.target.value })}
              className={`tabular-nums ${field}`}
              aria-label="Mínimo de leads por braço"
            />
          </Campo>
          <Campo rotulo="Piora máxima da proteção (%)">
            <input
              type="number"
              min="0"
              max="100"
              value={form.maximumGuardrailIncreasePercent}
              onChange={(e) => setForm({ ...form, maximumGuardrailIncreasePercent: e.target.value })}
              className={`tabular-nums ${field}`}
              aria-label="Piora máxima da proteção em porcento"
            />
          </Campo>
          <Campo rotulo="Janela mínima (dias)">
            <input
              type="number"
              min="7"
              max="45"
              value={form.minimumDays}
              onChange={(e) => setForm({ ...form, minimumDays: e.target.value })}
              className={`tabular-nums ${field}`}
              aria-label="Janela mínima em dias"
            />
          </Campo>
          <Campo rotulo="Janela máxima (dias)">
            <input
              type="number"
              min="7"
              max="45"
              value={form.maximumDays}
              onChange={(e) => setForm({ ...form, maximumDays: e.target.value })}
              className={`tabular-nums ${field}`}
              aria-label="Janela máxima em dias"
            />
          </Campo>
          <div className="sm:col-span-2 lg:col-span-4">
            <button disabled={busy || !form.learningCycleId} className={`w-full text-sm ${btnAccent}`}>
              Criar rascunho
            </button>
            {/* Os quatro limites deixaram de ser ecoados aqui porque agora são
                campos logo acima — repetir o mesmo número dois centímetros
                abaixo é o rótulo repetido que a régua manda cortar. Fica o que
                o campo não diz: a rota recusa fora destes limites. */}
            <p className="mt-2 text-micro leading-4 tabular-nums text-[var(--atlas-texto-fraco)]">
              O plano nasce em rascunho e só vira teste com decisão sua. A rota recusa o plano fora dos limites
              governados: mínimo de 30 leads por braço, janela de 7 a 45 dias, piora da proteção até 100% e teto
              diário nunca maior que o teto total.
            </p>
          </div>
        </form>
      </details>
    </div>
  );
}
