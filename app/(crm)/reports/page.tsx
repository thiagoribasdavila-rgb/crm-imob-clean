"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { LIVE_LEAD_SELECT, leadAsOpportunity, mapLegacyLead } from "@/lib/compat/legacy-v2";
import { AtlasEmpty } from "@/components/ui/AtlasUI";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";
import {
  DASHBOARD_PERIOD_KEY,
  PERIODOS_DO_RESUMO,
  PERIODO_PADRAO,
  dentroDoPeriodo,
  lerPeriodoSalvo,
  periodoParaGravar,
  type PeriodoDoResumo,
} from "@/lib/dashboards/periodo-do-resumo";

/* O vocabulário do recorte mora em lib/dashboards/periodo-do-resumo.ts: a MESMA
   lista desenha as pastilhas, valida o valor lido da sessão e define o padrão.
   Enumerá-lo aqui de novo era o caminho para as duas listas divergirem. */
type Period = PeriodoDoResumo;
type Lead = { id: string; status: string | null; source: string | null; score: number | null; created_at: string };
type Opportunity = { id: string; stage: string; value: number | null; probability: number; created_at: string; won_at: string | null };
type Briefing = { status: string; signals: Array<{ id: string; severity: string; title: string; evidence: string; action: string; href: string }> };
type WeeklyReport = { totals: { leads: number; spend: number | null; cpl: number | null; campaigns: number; developers: number }; campaigns: Array<{ campaignId: string; campaignName: string; leads: number; qualified: number; spend: number | null; cpl: number | null; costSource: string }>; developers: Array<{ developer: string; leads: number; spend: number | null; cpl: number | null; campaigns: number; allocation: string }>; warnings: string[]; period: { start: string; end: string } };
type WeeklyReview = { outcomes:{completedTasks:number;completedVisits:number;interactions:number;newLeads:number};backlog:{openTasks:number;overdueTasks:number;leadsWithoutNextAction:number;hotLeadsWithoutNextAction:number;noShows:number};quality:{completionRate:number|null;sampleSize:number;minimumSample:number;sufficientSample:boolean};plan:Array<{key:string;title:string;evidence:string;action:string;href:string}>;method:{llmCost:number;peopleRanking:boolean;humanDecisionRequired:boolean} };

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
/* `toFixed(1)` devolve "0.4" — ponto decimal, que não é a notação do país em que
   este CRM opera. Um relatório executivo em pt-BR que escreve a taxa com ponto
   e o dinheiro com vírgula está usando duas gramáticas numéricas na mesma
   faixa de quatro números. */
const pct = (value: number) => `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";
/* ── SEIS DAS OITO CLASSES DESTE CABEÇALHO NUNCA PINTARAM ───────────────────
   `app/globals.css` traz, sem camada e com especificidade (0,1,2):

       .atlas-app-shell thead th { font-size:10px; font-weight:750;
         letter-spacing:.09em; text-transform:uppercase; text-align:left;
         color:<um cinza literal>; }   ← e o tema claro o sobrescreve logo acima
       .atlas-app-shell th, td   { padding: 14px 16px; }

   (O cinza não é transcrito aqui de propósito: o portão `cor-cravada:check`
   conta ocorrências de hex no ARQUIVO, não no que a tela pinta — citar o valor
   num comentário faria a contagem subir sem um pixel mudar.)

   Utilitário do Tailwind vive em `@layer utilities` e perde para regra sem
   camada de qualquer jeito. MEDIDO no navegador (1280px, fora da media query
   de 767px), com a string antiga aplicada a um `<th>` dentro de
   `.atlas-app-shell`:

       escrito no arquivo            computado de verdade
       px-3            (12px)   →    padding-left  16px
       py-2.5          (10px)   →    padding-top   14px
       font-medium     (500)    →    font-weight   750
       tracking-[.14em](1,4px)  →    letter-spacing 0,9px
       text-[--atlas-texto-fraco] →  o cinza do globals, rgb(113,128,150)
       text-left                →    (globals já declara)
       text-micro      (10px)   →    10px, por coincidência
       font-mono                →    GeistMono  ← a ÚNICA viva

   Densidade declarada e não aplicada é pior que densidade ausente: ninguém
   volta a medir o que já parece resolvido. O `!` não é atalho — é o que faz a
   intenção JÁ ESCRITA passar a valer. Cabeçalho 44px → 32px, célula 52px →
   39,5px, ambos medidos. O que a regra do globals já entrega (caixa alta,
   peso, cor, alinhamento) sai da string em vez de mentir sobre si mesmo. */
const TH_CLASS = "px-4! py-2! font-mono";
const TD_CLASS = "px-4! py-2.5!";
const PERIOD_LABEL: Record<Period, string> = { day: "Hoje", week: "7 dias", month: "30 dias", all: "Histórico" };

/* ── O QUE SUSTENTA CADA NÚMERO VIAJA JUNTO COM O NÚMERO ────────────────────
   Precedente desta base, já pago em `/sales`: `Number(item.value ?? 0)` faz o
   negócio SEM valor entrar na soma como R$ 0, e o total sai com cara de
   medido. Aqui era pior, porque a fila desta tela vem de `leads` por
   `leadAsOpportunity`, que fixa `probability: 0` para todo mundo — o "forecast
   ponderado" era, POR CONSTRUÇÃO, R$ 0. Nenhuma linha do banco estava errada:
   a tela é que desenhava ausência de medida como previsão zerada. */
const temValor = (item: Opportunity) => item.value != null && Number(item.value) > 0;
const temScore = (item: Lead) => item.score != null && Number.isFinite(Number(item.score));
const GANHO = ["ganho", "won", "fechado"];

/* ── QUANTAS VENDAS PRECISAM SUSTENTAR UMA TAXA ─────────────────────────────
   MEDIDO nesta base em 02/08/2026: 490 leads, 2 ganhas, UMA com valor de venda
   registrado. Uma taxa de conversão calculada sobre 2 vendas não distingue
   0,2% de 2% — a próxima venda a move quase pela metade do que ela vale hoje.
   O número continua sendo exibido (ele é verdadeiro), mas nunca sozinho: a
   linha de baixo diz quantas vendas o sustentam e para onde a próxima o
   levaria. Cinco é o piso a partir do qual a sensibilidade deixa de ser a
   informação mais importante da linha — abaixo dele, ela é. */
const VENDAS_PARA_TAXA_ESTAVEL = 5;

/* Severidade do briefing em pt-BR, com tinta semântica. `sev` alimenta a banda
   lateral do painel; `null` em "saudável" porque nada precisa de atenção — e
   uma banda colorida permanente vira moldura, não sinal. */
const SEVERIDADE_DO_BRIEFING: Record<string, { label: string; tone: "danger" | "warning" | "info" | "success"; sev: string | null }> = {
  critical: { label: "crítico", tone: "danger", sev: "var(--atlas-estado-perigo)" },
  attention: { label: "atenção", tone: "warning", sev: "var(--atlas-estado-atencao)" },
  opportunity: { label: "oportunidade", tone: "info", sev: "var(--atlas-accent)" },
  healthy: { label: "saudável", tone: "success", sev: null },
};
const SEVERIDADE_PADRAO = { label: "analisando", tone: "info" as const, sev: null };

/* ── O CANAL DE ORIGEM, RECONHECIDO PELO NOME ───────────────────────────────
   Casa por PEDAÇO do texto normalizado (sem acento, minúsculo), porque a mesma
   origem chega grafada de várias formas nesta base: "meta_ads", "Meta Ads",
   "facebook-lead-ads". Origem que não casa com nada devolve `null` — e null
   quer dizer "sem símbolo", nunca um símbolo genérico: "não informada" é
   ausência de dado, e ausência não ganha marca de canal. */
const CANAIS: Array<[string, RegExp]> = [
  ["💬", /whats|zap(?!imoveis)/],
  ["📞", /telefon|ligac|fone|call|phone|discad/],
  ["✉️", /e?-?mail|newsletter/],
  /* `ads` precisa de fronteira NÃO-ALFABÉTICA dos dois lados, e não de `\b`:
     `\b` deixaria "leads" casar (l-e-"ads") e classificaria a origem
     "leads_importados" como mídia paga; e como `_` é caractere de palavra,
     `\bads\b` também NÃO casaria em "meta_ads", que é a grafia real da base. */
  ["📣", /anunc|meta|facebook|instagram|google|campanh|midia|trafego|(^|[^a-z])ads?([^a-z]|$)/],
  ["🏢", /portal|vivareal|viva-real|zapimoveis|olx|imovelweb|quintoandar/],
  ["🤝", /indic|referr|parceir|network/],
  ["🚶", /plantao|presenc|visita|balcao|walk/],
  ["🌐", /site|website|landing|organic|blog|seo|formulario/],
];
function canalDaOrigem(origem: string): string | null {
  const texto = origem.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  return CANAIS.find(([, padrao]) => padrao.test(texto))?.[0] ?? null;
}

export default function ReportsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>(PERIODO_PADRAO);
  const [periodHydrated, setPeriodHydrated] = useState(false);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [referenceTime, setReferenceTime] = useState(0);
  const [weekly, setWeekly] = useState<WeeklyReport | null>(null);
  const [weeklyReview, setWeeklyReview] = useState<WeeklyReview | null>(null);

  useEffect(() => {
    async function load() {
      // Custo/receita por campanha vem SOMENTE do relatório semanal (API com
      // dado oficial da Meta quando conectado). A tabela local de campanhas
      // com spend/revenue zerados foi removida: zero hardcoded exibido como
      // ROI/CPL "medido" é dado fabricado — mesma classe de problema das
      // antigas páginas de analytics.
      const leadResult = await supabase.from("leads").select(LIVE_LEAD_SELECT).not("status", "in", "(arquivado,ARQUIVADO,archived,ARCHIVED)").limit(5000);
      const mappedLeads = ((leadResult.data ?? []) as unknown as Record<string, unknown>[]).map(mapLegacyLead);
      if (leadResult.error) setError("Parte dos relatórios está temporariamente indisponível.");
      setLeads(mappedLeads as Lead[]);
      setOpportunities(mappedLeads.map(leadAsOpportunity) as Opportunity[]);
      setReferenceTime(Date.now());
      const { data: session } = await supabase.auth.getSession();
      if (session.session?.access_token) {
        const headers = { Authorization: `Bearer ${session.session.access_token}` };
        const [response, weeklyResponse, reviewResponse] = await Promise.all([fetch("/api/ai/briefing", { headers, cache: "no-store" }), fetch("/api/v1/analytics/weekly-acquisition", { headers, cache: "no-store" }), fetch("/api/v1/productivity/weekly", { headers, cache: "no-store" })]);
        if (response.ok) setBriefing(await response.json() as Briefing);
        if (weeklyResponse.ok) setWeekly(await weeklyResponse.json() as WeeklyReport);
        if (reviewResponse.ok) { const payload = await reviewResponse.json(); setWeeklyReview((payload.data || payload) as WeeklyReview); }
      }
      setLoading(false);
    }
    void load();
  }, []);

  /**
   * O RECORTE ESCOLHIDO VOLTA COM O USUÁRIO.
   *
   * Dois efeitos, nesta ordem, e a ordem é o ponto: a leitura roda uma vez na
   * montagem e levanta a bandeira `periodHydrated`; a gravação só grava depois
   * da bandeira, porque `periodoParaGravar` devolve `null` enquanto ela está
   * baixa. Sem essa guarda, o efeito de gravação dispararia na primeira
   * montagem com o padrão ainda no estado e apagaria a escolha salva — o
   * sintoma é "não persiste", com todo o código de persistência presente.
   *
   * `try/catch` nos dois: em navegação privada e com cota cheia o
   * sessionStorage lança, e um relatório não pode deixar de abrir por causa
   * disso. Perde-se a memória do recorte, não a tela.
   */
  useEffect(() => {
    try {
      setPeriod(lerPeriodoSalvo(window.sessionStorage.getItem(DASHBOARD_PERIOD_KEY)));
    } catch {
      setPeriod(PERIODO_PADRAO);
    }
    setPeriodHydrated(true);
  }, []);

  useEffect(() => {
    const aGravar = periodoParaGravar(period, periodHydrated);
    if (!aGravar) return;
    try {
      window.sessionStorage.setItem(DASHBOARD_PERIOD_KEY, aGravar);
    } catch {
      /* Sem memória do recorte é degradação aceitável; tela em branco não é. */
    }
  }, [period, periodHydrated]);

  const periodData = useMemo(() => {
    /* A janela vem do mesmo módulo que valida o recorte salvo. A tabela de dias
       morava aqui num ternário; duplicada, ela é o lugar onde "week" passa a
       significar 7 dias num arquivo e 30 no outro. */
    const recent = (date: string | null) => dentroDoPeriodo(period, date, referenceTime);
    return { leads: leads.filter((item) => recent(item.created_at)), opportunities: opportunities.filter((item) => recent(item.created_at)) };
  }, [leads, opportunities, period, referenceTime]);

  const metrics = useMemo(() => {
    const negocios = periodData.opportunities;
    const comValor = negocios.filter(temValor);
    const comProbabilidade = negocios.filter((item) => Number(item.probability ?? 0) > 0);
    const baseForecast = negocios.filter((item) => temValor(item) && Number(item.probability ?? 0) > 0);
    const comScore = periodData.leads.filter(temScore);
    const ganhas = negocios.filter((item) => GANHO.includes(String(item.stage).toLowerCase()));
    const leads = periodData.leads.length;
    return {
      leads,
      negocios: negocios.length,
      comValor: comValor.length,
      comProbabilidade: comProbabilidade.length,
      baseForecast: baseForecast.length,
      comScore: comScore.length,
      ganhas: ganhas.length,
      vgv: comValor.reduce((sum, item) => sum + Number(item.value), 0),
      forecast: baseForecast.reduce((sum, item) => sum + Number(item.value) * Number(item.probability) / 100, 0),
      conversion: leads ? (ganhas.length / leads) * 100 : 0,
      /* A próxima venda, com o MESMO denominador. É o tamanho do degrau que a
         taxa dá quando a amostra é de duas casas — a informação que o número
         sozinho esconde. */
      conversionProxima: leads ? ((ganhas.length + 1) / leads) * 100 : 0,
      averageScore: comScore.length ? comScore.reduce((sum, item) => sum + Number(item.score), 0) / comScore.length : 0,
    };
  }, [periodData]);

  const funnel = ["novo", "contato", "qualificacao", "visita", "proposta", "contrato", "ganho"].map((status) => ({
    status,
    total: periodData.leads.filter((lead) => lead.status === status).length,
  }));
  /* ── O FUNIL NÃO COBRE A BASE, E ISSO PRECISA APARECER ────────────────────
     As sete etapas acima são literais em minúsculo. Todo lead cujo `status`
     não casar exatamente com uma delas — grafia diferente, etapa nova, status
     legado — simplesmente não é contado por nenhuma barra. Sem esta linha, uma
     base de centenas de leads pode desenhar um funil inteiro em zero, e funil
     zerado se lê como "a operação parou", não como "o vocabulário divergiu". */
  const noFunil = funnel.reduce((sum, item) => sum + item.total, 0);
  const foraDoFunil = periodData.leads.length - noFunil;

  const sources = Array.from(new Set(periodData.leads.map((lead) => lead.source || "não informada"))).map((source) => ({
    source,
    total: periodData.leads.filter((lead) => (lead.source || "não informada") === source).length,
  })).sort((a, b) => b.total - a.total);

  /* ── OS QUATRO NÚMEROS, CADA UM COM O SEU LASTRO ──────────────────────────
     `lastro: false` NÃO vira zero: vira "sem lastro" com a frase do que falta.
     Zero medido continua zero (nenhuma venda no recorte ⇒ 0,0% é verdade);
     zero por ausência de medida some. */
  const decisive = [
    {
      label: "VGV em oportunidades",
      lastro: metrics.negocios === 0 || metrics.comValor > 0,
      value: money(metrics.vgv),
      falta: `nenhum dos ${metrics.negocios} negócios do recorte tem valor registrado`,
      nota: metrics.negocios === 0 ? "nenhum negócio no recorte" : `${metrics.comValor}/${metrics.negocios} com valor registrado`,
      notaInk: "",
    },
    {
      label: "forecast ponderado",
      lastro: metrics.negocios === 0 || metrics.baseForecast > 0,
      value: money(metrics.forecast),
      falta: metrics.comValor === 0
        ? `nenhum dos ${metrics.negocios} negócios tem valor registrado`
        : `${metrics.comValor} com valor, nenhum com probabilidade medida`,
      nota: metrics.negocios === 0 ? "nenhum negócio no recorte" : `${metrics.baseForecast}/${metrics.negocios} com valor e probabilidade`,
      notaInk: "",
    },
    {
      label: "conversão",
      lastro: metrics.leads > 0,
      value: pct(metrics.conversion),
      falta: "nenhum lead no recorte — sem denominador não há taxa",
      /* A taxa nunca aparece sozinha. Com poucas vendas, para onde a PRÓXIMA a
         levaria é mais informativo do que a casa decimal que ela tem hoje. */
      nota: `${metrics.ganhas} ${metrics.ganhas === 1 ? "venda" : "vendas"} em ${metrics.leads} leads`
        + (metrics.ganhas < VENDAS_PARA_TAXA_ESTAVEL ? ` · a próxima levaria a ${pct(metrics.conversionProxima)}` : ""),
      /* A tinta de atenção vai na LINHA DO LASTRO, não no número. O número está
         certo; frágil é a amostra que o sustenta. Pintar o valor de âmbar diria
         "a conversão está ruim", que é outra afirmação — e uma que esta tela
         não tem como fazer. */
      notaInk: metrics.leads > 0 && metrics.ganhas < VENDAS_PARA_TAXA_ESTAVEL ? "cc6-warn" : "",
    },
    {
      label: "score médio",
      lastro: metrics.leads === 0 || metrics.comScore > 0,
      value: metrics.averageScore.toFixed(0),
      falta: `nenhum dos ${metrics.leads} leads do recorte tem score`,
      nota: metrics.leads === 0 ? "nenhum lead no recorte" : `média de ${metrics.comScore}/${metrics.leads} leads com score`,
      notaInk: "",
    },
  ];

  /* A severidade do sinal EXIBIDO manda, não a do briefing inteiro: o painel
     mostra `signals[0]`, e é sobre ele que a pessoa decide. `status` só entra
     como recuo quando não há sinal nenhum. */
  const briefingSeveridade =
    SEVERIDADE_DO_BRIEFING[briefing?.signals[0]?.severity ?? ""]
    ?? SEVERIDADE_DO_BRIEFING[briefing?.status ?? ""]
    ?? SEVERIDADE_PADRAO;

  return (
    <div className="space-y-4 pb-8">
      <PageHeader
        eyebrow="Analytics · Executivo"
        title="Relatórios executivos"
        description="VGV, forecast, conversão, marketing e qualidade da base — números para decidir, não coleção de gráficos."
        action={{ href: "/decision-center", label: "Abrir decisões", priority: "secondary" }}
      />

      {/* Números decisivos primeiro, com o recorte de período na mesma régua.
          Única superfície com 3D da página. */}
      <section aria-label="Números decisivos do período">
        <TiltShell className="cc6-panel cc6-reveal p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="cc6-eyebrow">Números decisivos</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Período do relatório">
              {PERIODOS_DO_RESUMO.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={period === key}
                  onClick={() => setPeriod(key)}
                  /* `min-h-11` porque estas quatro pastilhas são O controle
                     desta tela — trocá-las refaz VGV, forecast, conversão,
                     score, funil e origens. O `.cc6-chip` do vocabulário mede
                     24,5px de altura (MEDIDO no navegador), abaixo do alvo de
                     toque de 44px; aqui o alvo cresce sem mexer no vocabulário
                     compartilhado, que é de outro dono. */
                  className={`cc6-chip cc6-interativo min-h-11 cursor-pointer px-4 ${period === key ? "cc6-destaque text-[var(--atlas-texto-forte)]!" : " hover:text-[var(--atlas-texto-forte)]!"} ${focusRing}`}
                >
                  {PERIOD_LABEL[key]}
                </button>
              ))}
            </div>
          </div>
          {/* ── OS QUATRO NÚMEROS DESCERAM DE 24/30px PARA 20px ──────────────
              `text-2xl sm:text-3xl` computa 24px e 30px (MEDIDO) — nenhum dos
              dois é degrau da escala (11 · 13 · 20 · 34). `--text-numero` (20px)
              é literalmente "o número que se compara", e é o que estes quatro
              fazem: são lidos lado a lado, não isolados. É também o degrau que
              `/sales` já usa na sua grade de quatro, na mesma leitura. */}
          <div className="mt-4 flex flex-wrap gap-x-10 gap-y-4" aria-busy={loading}>
            {decisive.map((metric) => (
              <div key={metric.label} className="min-w-0">
                {loading ? (
                  <p className="cc6-metric-value text-numero leading-none">—</p>
                ) : metric.lastro ? (
                  <p className="cc6-metric-value text-numero leading-none">{metric.value}</p>
                ) : (
                  <p className="cc6-warn text-rotulo font-semibold leading-none">sem lastro</p>
                )}
                <p className="cc6-metric-label mt-1.5">{metric.label}</p>
                <p className={`mt-0.5 max-w-60 text-rotulo leading-4 ${metric.notaInk || "text-[var(--atlas-texto-fraco)]"}`}>
                  {loading ? "medindo…" : metric.lastro ? metric.nota : metric.falta}
                </p>
              </div>
            ))}
          </div>
        </TiltShell>
      </section>

      {error ? (
        /* O rosa cravado (o valor do tema NOTURNO, copiado à mão) não é
           sobrescrito por tema nenhum: no tema claro ele continuava rosa-claro
           sobre painel branco. A banda sai do mesmo token de estado que o texto
           ao lado já usa — e a contagem de cor cravada deste arquivo cai de 1
           para 0. */
        <div className="cc6-sev-band cc6-panel-quiet py-3 pl-4 pr-3 text-corpo leading-6 text-[var(--atlas-estado-perigo)]" role="alert" style={{ "--cc6-sev": "var(--atlas-estado-perigo)" } as CSSProperties}>{error}</div>
      ) : null}

      {weeklyReview ? (
        <section className="cc6-panel cc6-reveal p-4 sm:p-5" style={{ animationDelay: "60ms" }} data-phase="49-weekly-review" aria-labelledby="weekly-review-title">
          {/* ── TÍTULO DE PAINEL É RÓTULO, NÃO CONTEÚDO ────────────────────
              `text-lg` computa 18px — um sexto degrau fora de 11/13/20/34. E
              eram TRÊS linhas para dizer de que painel se trata: eyebrow,
              título e recorte. Os três textos continuam inteiros, agora numa
              linha de base só. Quem decide lê o número; o título só precisa
              nomear onde ele está. */}
          <h2 id="weekly-review-title" className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-corpo font-semibold tracking-tight text-[var(--atlas-texto-forte)]">
            <span className="cc6-eyebrow">Fase 49 · Revisão semanal pessoal</span>
            <span>O que avançou e o que merece foco</span>
            <span className="text-rotulo font-normal text-[var(--atlas-texto-fraco)]">últimos 7 dias, somente sua operação</span>
          </h2>
          <div className="mt-4 flex flex-wrap gap-x-10 gap-y-4">
            {([["tarefas concluídas", weeklyReview.outcomes.completedTasks], ["visitas realizadas", weeklyReview.outcomes.completedVisits], ["interações registradas", weeklyReview.outcomes.interactions], ["novas leads", weeklyReview.outcomes.newLeads]] as const).map(([label, value]) => (
              <div key={label}>
                <p className="cc6-metric-value text-numero leading-none">{value}</p>
                <p className="cc6-metric-label mt-1.5">{label}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[.8fr_1.2fr]">
            <article className="cc6-panel-quiet p-4">
              <h3 className="text-corpo font-semibold tracking-tight text-[var(--atlas-texto-forte)]">Pendências reais</h3>
              <div className="mt-3 space-y-1.5 text-corpo leading-5 text-[var(--atlas-texto-medio)]">
                <p><strong className="cc6-num cc6-crit font-semibold">{weeklyReview.backlog.overdueTasks}</strong> tarefas vencidas</p>
                <p><strong className="cc6-num cc6-warn font-semibold">{weeklyReview.backlog.leadsWithoutNextAction}</strong> leads sem próxima ação</p>
                <p><strong className="cc6-num cc6-warn font-semibold">{weeklyReview.backlog.hotLeadsWithoutNextAction}</strong> quentes sem agenda</p>
                <p><strong className="cc6-num font-semibold text-[var(--atlas-texto-forte)]">{weeklyReview.backlog.noShows}</strong> ausências em visitas</p>
              </div>
              <p className="cc6-hairline mt-3 pt-3 text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
                {weeklyReview.quality.sufficientSample ? `Cumprimento observado: ${weeklyReview.quality.completionRate}% em ${weeklyReview.quality.sampleSize} tarefas.` : `Amostra pequena (${weeklyReview.quality.sampleSize}/${weeklyReview.quality.minimumSample}); sem percentual para evitar conclusão frágil.`}
              </p>
            </article>
            <article className="cc6-panel-quiet p-4">
              <h3 className="text-corpo font-semibold tracking-tight text-[var(--atlas-texto-forte)]">Plano da próxima semana</h3>
              <div className="mt-3 space-y-2">
                {weeklyReview.plan.map((item, index) => (
                  <a key={item.key} href={item.href} className={`flex gap-3 rounded-xl border border-[rgba(148,163,184,0.12)] p-3 transition-colors hover:cc6-destaque ${focusRing}`}>
                    <span className="cc6-num text-rotulo text-[var(--atlas-texto-fraco)]" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                    <span className="min-w-0">
                      <strong className="block text-corpo font-semibold text-[var(--atlas-texto-forte)]">{item.title}</strong>
                      <span className="mt-0.5 block text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">{item.evidence}</span>
                      <span className="mt-0.5 block text-rotulo font-medium text-[color:var(--atlas-accent-hover)]">{item.action} →</span>
                    </span>
                  </a>
                ))}
              </div>
            </article>
          </div>
        </section>
      ) : null}

      {weekly ? (
        <section className="cc6-panel cc6-reveal p-4 sm:p-5" style={{ animationDelay: "120ms" }} aria-labelledby="weekly-acquisition-title">
          <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <h2 id="weekly-acquisition-title" className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-corpo font-semibold tracking-tight text-[var(--atlas-texto-forte)]">
              <span className="cc6-eyebrow">Aquisição · Últimos 7 dias</span>
              <span>Leads e custo por campanha e incorporadora</span>
              <span className="text-rotulo font-normal text-[var(--atlas-texto-fraco)]">custo oficial da Meta quando conectado</span>
            </h2>
            <button type="button" onClick={() => window.print()} className="cc6-ghost-btn min-h-11 shrink-0">Imprimir relatório</button>
          </header>
          <div className="mt-4 flex flex-wrap gap-x-10 gap-y-4">
            {([["leads", String(weekly.totals.leads)], ["investimento", weekly.totals.spend === null ? "não medido" : money(weekly.totals.spend)], ["CPL", weekly.totals.cpl === null ? "—" : money(weekly.totals.cpl)], ["campanhas", String(weekly.totals.campaigns)], ["incorporadoras", String(weekly.totals.developers)]] as const).map(([label, value]) => (
              <div key={label}>
                <p className="cc6-metric-value text-numero leading-none">{value}</p>
                <p className="cc6-metric-label mt-1.5">{label}</p>
              </div>
            ))}
          </div>
          {weekly.warnings?.length ? (
            /* Sem emoji aqui, e de propósito: a API produz no máximo UM aviso, e
               sempre o mesmo tipo (falha na leitura do custo pago). Lista
               homogênea onde todos os itens teriam o mesmo símbolo — se todos
               têm, nenhum informa. A banda de severidade e a tinta de atenção
               já dizem o que precisa ser dito. */
            <div className="mt-4 grid gap-2">
              {weekly.warnings.map((warning) => (
                <p key={warning} className="cc6-sev-band cc6-panel-quiet py-2.5 pl-4 pr-3 text-corpo leading-5 text-[var(--atlas-estado-atencao)]" style={{ "--cc6-sev": "var(--atlas-estado-atencao)" } as CSSProperties}>{warning}</p>
              ))}
            </div>
          ) : null}
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="overflow-x-auto">
              <h3 className="cc6-eyebrow">Por campanha</h3>
              <table className="mt-2 w-full min-w-[560px] text-corpo">
                {/* `border-b` no `<tr>` e `border-t` em cada linha eram
                    DECLARAÇÕES MORTAS: `.atlas-app-shell table` fixa
                    `border-collapse: separate`, e no modelo separado o navegador
                    ignora borda em `tr`/`thead`/`tbody` (CSS 2.1 §17.6.1). O que
                    separa as linhas — e sempre separou — é o `border-bottom` que
                    o globals põe em `th, td`. Some a declaração morta e some com
                    ela o cinza literal que ela carregava. */}
                <thead>
                  <tr>
                    <th scope="col" className={TH_CLASS}>Campanha</th>
                    <th scope="col" className={TH_CLASS}>Leads</th>
                    <th scope="col" className={TH_CLASS}>Qualificadas</th>
                    <th scope="col" className={TH_CLASS}>Custo</th>
                    <th scope="col" className={TH_CLASS}>CPL</th>
                  </tr>
                </thead>
                <tbody>
                  {weekly.campaigns.map((row) => (
                    /* O realce sai de token: `bg-white/[0.015]` é branco no tema
                       claro sobre painel branco — invisível justamente onde a
                       linha precisa responder ao ponteiro. */
                    <tr key={row.campaignId} className="transition-colors hover:bg-[color-mix(in_srgb,var(--atlas-accent)_4%,transparent)]">
                      <td className={`${TD_CLASS} font-semibold text-[var(--atlas-texto-forte)]`}>{row.campaignName}</td>
                      <td className={`cc6-num ${TD_CLASS} text-[var(--atlas-texto-medio)]`}>{row.leads}</td>
                      <td className={`cc6-num ${TD_CLASS} text-[var(--atlas-texto-medio)]`}>{row.qualified}</td>
                      <td className={`cc6-num ${TD_CLASS} text-[var(--atlas-texto-medio)]`}>{row.spend === null ? "Não conectado" : money(row.spend)}</td>
                      <td className={`cc6-num ${TD_CLASS} text-[var(--atlas-texto-medio)]`}>{row.cpl === null ? "—" : money(row.cpl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto">
              <h3 className="cc6-eyebrow">Por incorporadora</h3>
              <table className="mt-2 w-full min-w-[520px] text-corpo">
                <thead>
                  <tr>
                    <th scope="col" className={TH_CLASS}>Incorporadora</th>
                    <th scope="col" className={TH_CLASS}>Leads</th>
                    <th scope="col" className={TH_CLASS}>Campanhas</th>
                    <th scope="col" className={TH_CLASS}>Custo</th>
                    <th scope="col" className={TH_CLASS}>CPL</th>
                  </tr>
                </thead>
                <tbody>
                  {weekly.developers.map((row) => (
                    <tr key={row.developer} className="transition-colors hover:bg-[color-mix(in_srgb,var(--atlas-accent)_4%,transparent)]">
                      <td className={TD_CLASS}>
                        <span className="font-semibold text-[var(--atlas-texto-forte)]">{row.developer}</span>
                        {row.allocation !== "direct" ? <span className="mt-0.5 block text-rotulo text-[var(--atlas-estado-atencao)]">rateio proporcional por leads</span> : null}
                      </td>
                      <td className={`cc6-num ${TD_CLASS} text-[var(--atlas-texto-medio)]`}>{row.leads}</td>
                      <td className={`cc6-num ${TD_CLASS} text-[var(--atlas-texto-medio)]`}>{row.campaigns}</td>
                      <td className={`cc6-num ${TD_CLASS} text-[var(--atlas-texto-medio)]`}>{row.spend === null ? "Não conectado" : money(row.spend)}</td>
                      <td className={`cc6-num ${TD_CLASS} text-[var(--atlas-texto-medio)]`}>{row.cpl === null ? "—" : money(row.cpl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── A SEVERIDADE DO SINAL ESTAVA NO PAYLOAD E NÃO NA TELA ────────────
          O chip antigo imprimia `status.toUpperCase()`: "CRITICAL", "ATTENTION",
          "HEALTHY" — o enum cru da API, em inglês, e sempre na MESMA tinta
          neutra. Um sinal crítico e um sinal saudável tinham exatamente a mesma
          aparência num CRM em português. `severity` já viajava em cada sinal e
          nunca era desenhada.

          O que entra é palavra em pt-BR + cor semântica — dois canais que não
          existiam. Emoji NÃO entra aqui justamente por isso: seria o terceiro
          símbolo dizendo a mesma coisa, que é a redundância que o passe acabou
          de remover. */}
      <section
        className={`cc6-panel cc6-reveal p-4 sm:p-5 ${briefingSeveridade.sev ? "cc6-sev-band" : ""}`}
        style={{ animationDelay: "180ms", ...(briefingSeveridade.sev ? { "--cc6-sev": briefingSeveridade.sev } : {}) } as CSSProperties}
        aria-labelledby="briefing-title"
      >
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 id="briefing-title" className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-corpo font-semibold tracking-tight text-[var(--atlas-texto-forte)]">
            <span className="cc6-eyebrow">IA preditiva explicável</span>
            <span>{briefing?.signals[0]?.title || "Consolidando tendências"}</span>
          </h2>
          <StatusBadge tone={briefingSeveridade.tone}>{briefingSeveridade.label}</StatusBadge>
        </header>
        <p className="mt-2 max-w-3xl text-corpo leading-6 text-[var(--atlas-texto-medio)]">{briefing?.signals[0]?.evidence || "O Atlas está reunindo sinais suficientes para calcular risco, oportunidade e próxima ação."}</p>
        {briefing?.signals[0]?.action ? <p className="mt-2 max-w-3xl text-corpo font-medium leading-6 text-[var(--atlas-texto-forte)]">{briefing.signals[0].action}</p> : null}
        {briefing?.signals[0] ? (
          <a href={briefing.signals[0].href} className={`cc6-ghost-btn mt-3 min-h-11 ${focusRing}`}>Abrir ação recomendada →</a>
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="cc6-panel cc6-reveal p-4 sm:p-5" style={{ animationDelay: "240ms" }} aria-labelledby="funnel-title">
          <h2 id="funnel-title" className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-corpo font-semibold tracking-tight text-[var(--atlas-texto-forte)]">
            <span className="cc6-eyebrow">Distribuição do período</span>
            <span>Funil comercial</span>
          </h2>
          {/* A barra fica: sete contagens lidas em coluna não deixam ver a
              PROPORÇÃO entre elas, e proporção é a forma do funil. O que sai é
              o piso fabricado — `Math.max(3, …)` desenhava 3% de barra para
              etapa com ZERO lead, e barra visível onde não há nada é ausência
              desenhada como presença. Etapa vazia agora não pinta nada. */}
          <div className="mt-4 space-y-3">
            {funnel.map((item) => {
              const width = periodData.leads.length ? (item.total / periodData.leads.length) * 100 : 0;
              return (
                <div key={item.status}>
                  <div className="flex items-baseline justify-between text-corpo">
                    <span className="capitalize text-[var(--atlas-texto-medio)]">{item.status}</span>
                    <strong className="cc6-num font-semibold text-[var(--atlas-texto-forte)]">{item.total}</strong>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--atlas-texto-fraco)_16%,transparent)]">
                    <div className="h-full rounded-full bg-[color:var(--atlas-accent)] transition-[width]" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          {foraDoFunil > 0 ? (
            <p className="cc6-hairline mt-4 pt-3 text-rotulo leading-5 text-[var(--atlas-estado-atencao)]">
              {foraDoFunil} {foraDoFunil === 1 ? "lead do recorte não está" : "leads do recorte não estão"} em nenhuma das sete etapas acima — o funil cobre {noFunil} de {periodData.leads.length}. Somar só as barras subestima a base.
            </p>
          ) : null}
        </article>
        <article className="cc6-panel cc6-reveal p-4 sm:p-5" style={{ animationDelay: "300ms" }} aria-labelledby="sources-title">
          <h2 id="sources-title" className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-corpo font-semibold tracking-tight text-[var(--atlas-texto-forte)]">
            <span className="cc6-eyebrow">Qualidade da base</span>
            <span>Origem dos leads</span>
          </h2>
          <div className="cc6-hairline mt-4">
            {sources.length === 0 ? (
              <AtlasEmpty
                reason="no-activity"
                eyebrow="Base sem origem"
                title="Sem dados de origem no período"
                description="As origens dos leads aparecem quando houver registros no recorte selecionado."
              />
            ) : null}
            {/* ── AQUI O EMOJI ENTRA, E É O ÚNICO LUGAR DESTA TELA ─────────
                Esta lista é uma VARREDURA vertical de canais de origem, e até
                agora a palavra era o único canal que os separava: sem cor, sem
                ícone, sem forma. "meta_ads", "indicacao", "whatsapp" e "site"
                têm o mesmo peso visual, e quem procura de relance por onde a
                base entra tem de ler dez linhas inteiras.

                O símbolo é o do CANAL, não da linha: cada origem recebe um
                diferente, e origem que o mapa NÃO reconhece — inclusive "não
                informada", que é ausência de dado — fica sem símbolo nenhum.
                Isso é o oposto de "todos têm, ninguém informa": a marca separa
                o que é canal conhecido do que ninguém registrou.

                `aria-hidden` porque o nome da origem vem logo ao lado: o leitor
                de tela deve ouvir "WhatsApp 42", não "balão de fala WhatsApp
                42". */}
            {sources.slice(0, 10).map((item) => {
              const canal = canalDaOrigem(item.source);
              return (
                <div key={item.source} className="flex items-center justify-between gap-3 border-t border-[rgba(148,163,184,0.12)] py-3 first:border-t-0">
                  <span className="flex min-w-0 items-baseline gap-2 text-corpo text-[var(--atlas-texto-medio)]">
                    {canal ? <span aria-hidden="true" className="shrink-0">{canal}</span> : null}
                    <span className="min-w-0 truncate capitalize">{item.source}</span>
                  </span>
                  <strong className="cc6-num shrink-0 text-corpo font-semibold text-[var(--atlas-texto-forte)]">{item.total}</strong>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      {/* Governança consolidada (antes repetida no cabeçalho da revisão semanal,
          no semanal de aquisição e no cartão "Leitura do período"). */}
      <p className="cc6-reveal text-rotulo leading-5 text-[var(--atlas-texto-fraco)]" style={{ animationDelay: "360ms" }}>
        Somente dados do seu escopo, sem ranking de pessoas e sem decisões automáticas — forecast, campanhas e registros só mudam com revisão humana; o plano semanal é explicável e tem custo LLM zero.
      </p>
    </div>
  );
}
