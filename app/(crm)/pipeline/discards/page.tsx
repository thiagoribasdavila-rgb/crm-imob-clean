"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";

/* Denominador do descarte. Os campos são opcionais porque o relatório só passa
   a apurá-los quando a base por origem/campanha da janela puder ser contada —
   e um relatório que ainda não apura precisa dizer isso, não devolver uma taxa
   calculada sobre denominador inexistente. */
type DiscardBaseFields = {
  leadsFromSource?: number | null;
  leadsFromCampaign?: number | null;
  discardRatePct?: number | null;
  sampleSufficient?: boolean | null;
  baseUnavailableReason?: string | null;
  /** Leads DISTINTOS descartados — o numerador da taxa (o mesmo lead descartado
   *  duas vezes é um lead perdido, não dois). */
  uniqueLeads?: number | null;
};

type DiscardReport = {
  period: { start: string; end: string; days: number };
  totals: {
    lostMoves: number | null;
    discarded: number;
    uniqueLeads: number;
    classified: number;
    coveragePct: number | null;
    /** Saídas revertidas na janela. Vem sempre, inclusive 0. */
    revertidas?: number;
    /** Leads em estado de saída anteriores ao início do ledger. */
    semMovimentoRegistrado?: number | null;
  };
  /** Desde quando a medição existe — a janela pedida pode ser maior que ela. */
  procedencia?: {
    fonte: string;
    estagiosContados: string[];
    registroDeMovimentoDesde: string | null;
    janelaMaiorQueORegistro: boolean;
    motivoGravadoDesde: string;
  };
  byReason: Array<{ key: string; label: string; metaCategory: string; count: number; share: number }>;
  byMetaCategory: Array<{ category: string; count: number; share: number }>;
  bySource: Array<{ source: string; count: number; share: number } & DiscardBaseFields>;
  byCampaign: Array<{ campaignId: string | null; campaign: string | null; count: number; share: number } & DiscardBaseFields>;
  andromeda: { policy: string; directorDecisionRequired: boolean; readyForCrmLeadStatusSync: boolean; taxonomyVersion: number };
  generatedAt: string;
};
type ReportStatus = "loading" | "ready" | "restricted" | "error";
type WindowDays = 7 | 30 | 90;

const WINDOW_OPTIONS: WindowDays[] = [7, 30, 90];
const TRACO = "—";

/* ── A LINHA É A BARRA ─────────────────────────────────────────────────────
   O `ShareMeter` anterior desenhava um trilho de 1px POR MOTIVO logo abaixo do
   texto. Somado às hairlines de linha, de faixa e dos dois painéis de origem,
   a tela chegava a ~47 linhas horizontais — e o share ainda aparecia duas
   vezes (na barra e no "%" à direita). Pintar a PRÓPRIA faixa entrega a mesma
   comparação geométrica com zero filete novo, e a linha inteira vira o dado.

   A tinta é 12%, e o número não foi escolhido no olho: medido com a fórmula da
   WCAG contra os quatro fundos exigidos, `--atlas-estado-perigo` sobre a faixa
   dá 4,57 no pior caso (tema claro, sobre `--atlas-surface-subtle`) e cai para
   4,41 — reprovado — a 14%. Fundo e cor são um par: sobre a faixa só entram
   `texto-forte` (13,1 no pior caso), `texto-medio` (7,3) e `estado-perigo`
   (4,57). `texto-fraco` (4,28) e `estado-sucesso` (3,85) NÃO entram. */
const TINTA_DA_FAIXA = 12;
const faixaDeShare = (share: number) => ({
  width: `${Math.min(100, Math.max(0, share))}%`,
  background: `color-mix(in srgb, var(--atlas-estado-perigo) ${TINTA_DA_FAIXA}%, transparent)`,
});

/* A categoria Meta chegava crua na tela — `invalid_contact_info` num selo, para
   um gestor brasileiro. A chave continua alcançável (fica no `title` de cada
   fatia e de cada item da legenda) e o rótulo passa a ser legível. Chave sem
   tradução conhecida cai de volta nela mesma: nada some. */
const CATEGORIA_META_PT: Record<string, string> = {
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
const rotuloCategoria = (categoria: string) => CATEGORIA_META_PT[categoria] ?? categoria;

/* Rampa de UMA cor. Categoria de descarte não tem hierarquia de matiz — tem
   ordem de tamanho —, e uma paleta decorativa inventaria significado que o dado
   não carrega. Alfa por color-mix porque concatenar dígito no fim de um token
   não funciona, e SVG porque `fillStyle` de canvas não resolve `var(--token)`. */
const tintaDaFatia = (indice: number) =>
  `color-mix(in srgb, var(--atlas-estado-perigo) ${Math.max(26, 92 - indice * 12)}%, transparent)`;

const dataCurta = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : TRACO;

/* ── `cc6-num` PINTA O NÚMERO DE ÂMBAR NO TEMA CLARO, E VENCE O UTILITÁRIO ──
   MEDIDO no navegador, com o CSS compilado do produto: no tema claro,
   `:root[data-theme="light"] .cc6-num:not(.atlas-leads-table-panel *)` crava
   `#b45309`. A regra é SEM CAMADA e os utilitários do Tailwind vivem em
   `@layer utilities` — sem camada vence camada. Resultado: qualquer elemento
   que carregue `cc6-num` E uma tinta (`text-[var(--atlas-estado-perigo)]`,
   `text-[var(--atlas-texto-forte)]`) sai âmbar, e a tinta pedida é ignorada
   em silêncio. Só `.cc6-crit/.cc6-warn/.cc6-ok` escapam, porque têm regra de
   mesma especificidade declarada DEPOIS.

   O estrago concreto que isso causaria aqui: a taxa de descarte tem duas
   leituras — vermelha quando a amostra decide, apagada quando não decide — e
   as duas sairiam da MESMA cor. A distinção morreria sem ninguém ver.

   O conserto não é `!` nem mexer em globals.css (arquivo fora desta entrega):
   é separar os papéis. `cc6-num` fica no PAI e só doa a figura tabular; a cor
   fica no FILHO, onde a regra do pai não alcança e a herança não vale. Medido
   no mesmo CSS: filho sai #be123c / #334155 / #0b1220, como pedido. */
function Num({
  children,
  ink = "text-[var(--atlas-texto-forte)]",
  wrapper = "",
}: {
  children: ReactNode;
  ink?: string;
  wrapper?: string;
}) {
  return (
    <span className={`cc6-num ${wrapper}`.trim()}>
      <span className={ink}>{children}</span>
    </span>
  );
}

/* Taxa exige as duas pontas: quantos descartes e de quantos leads. Faltando
   qualquer uma, a resposta é o motivo — nunca um número. */
function readDiscardBase(item: DiscardBaseFields) {
  const base = typeof item.leadsFromSource === "number"
    ? item.leadsFromSource
    : typeof item.leadsFromCampaign === "number"
      ? item.leadsFromCampaign
      : null;
  const ratePct = typeof item.discardRatePct === "number" ? item.discardRatePct : null;
  if (base === null || ratePct === null) {
    // Sem motivo APURADO pela rota, a tela declara a ausência da base em vez de
    // inventar a causa dela. `null` continua sendo o valor honesto: zero
    // pareceria uma origem saudável.
    const reason = typeof item.baseUnavailableReason === "string" && item.baseUnavailableReason.trim()
      ? item.baseUnavailableReason.trim()
      : null;
    return { measured: false as const, reason };
  }
  return { measured: true as const, base, ratePct, insufficient: item.sampleSufficient === false };
}

/* ── ONDE A HIERARQUIA ESTAVA INVERTIDA ───────────────────────────────────
   A contagem de descartes vinha em 14px seminegrito e a TAXA — o número que
   autoriza cortar a origem — vinha em 11px na cor mais fraca da tela. "58
   descartes" não decide nada; "58 de 61 leads, 95% descartados" decide. A taxa
   sobe para o degrau `numero` (20px) e a contagem desce para a linha de
   contexto, junto do denominador que ela sempre precisou. */
function LinhaDeOrigem({
  nome,
  count,
  share,
  item,
  atraso,
}: {
  nome: string;
  count: number;
  share: number;
  item: DiscardBaseFields;
  atraso: number;
}) {
  const base = readDiscardBase(item);
  const distintos = item.uniqueLeads ?? count;
  return (
    <div
      className="cc6-reveal relative isolate overflow-hidden px-5 py-2.5"
      style={{ animationDelay: `${atraso}ms` }}
    >
      <span aria-hidden="true" className="absolute inset-y-[3px] left-0 -z-10 rounded-r-[3px]" style={faixaDeShare(share)} />
      {/* Sem `truncate`: nome de campanha cortado com reticências é justamente o
          nome que o gestor precisa ler inteiro para mandar pausar. */}
      <p className="text-corpo leading-5 font-medium break-words text-[var(--atlas-texto-forte)]">{nome}</p>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {base.measured ? (
          <Num
            wrapper="text-numero leading-6 font-semibold"
            ink={base.insufficient ? "text-[var(--atlas-texto-medio)]" : "text-[var(--atlas-estado-perigo)]"}
          >
            {base.ratePct}%
          </Num>
        ) : (
          <Num wrapper="text-numero leading-6 font-semibold" ink="text-[var(--atlas-texto-medio)]">
            {TRACO}
          </Num>
        )}
        <span className="text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
          {base.measured ? (
            <>
              descartados · <Num ink="text-[var(--atlas-texto-forte)]">{distintos}</Num> de{" "}
              <Num ink="text-[var(--atlas-texto-forte)]">{base.base}</Num> leads
            </>
          ) : (
            <>taxa de descarte · {base.reason ?? "base não apurada nesta janela"}</>
          )}
          {" · "}
          <Num ink="text-[var(--atlas-texto-medio)]">{count}</Num> descarte{count === 1 ? "" : "s"} (
          <Num ink="text-[var(--atlas-texto-medio)]">{share}%</Num> do total)
        </span>
      </div>
      {base.measured && base.insufficient ? (
        <p className="mt-0.5 text-micro leading-4 text-[var(--atlas-texto-medio)]">amostra insuficiente para decidir</p>
      ) : null}
    </div>
  );
}

/* ── O GRÁFICO ─────────────────────────────────────────────────────────────
   Ele responde uma pergunta que a coluna de números não responde de relance:
   "minha perda vem de lead que não deveria ter entrado (duplicado, contato
   inválido, fora da área) ou de lead bom que não fechou (sem interesse,
   crédito negado)?" — a resposta muda quem age, mídia ou venda. Vários motivos
   caem na MESMA categoria Meta, então lê-la exigia somar de cabeça.

   Empilhar é legítimo aqui porque `byMetaCategory` é partição exata de
   `discarded`: cada saída cai em uma categoria, com `other` de default. Onde
   isso não vale, empilhar desenharia uma soma que não existe. */
function ComposicaoMeta({
  categorias,
  total,
}: {
  categorias: DiscardReport["byMetaCategory"];
  total: number;
}) {
  if (!categorias.length || total <= 0) return null;
  const VAO = 0.6;
  /* O início de cada fatia é a soma das participações BRUTAS anteriores — a
     folga sai da largura, não do avanço, senão as fatias descolariam do 100%.
     Sem cursor mutável: acumular numa variável de fora do `map` durante o
     render é justamente o que o compilador do React proíbe. */
  const fatias = categorias.map((item, indice) => {
    const bruta = (item.count / total) * 100;
    const inicio = categorias
      .slice(0, indice)
      .reduce((soma, anterior) => soma + (anterior.count / total) * 100, 0);
    return {
      ...item,
      x: inicio + (indice > 0 ? VAO : 0),
      largura: Math.max(0, bruta - (indice > 0 ? VAO : 0)),
      tinta: tintaDaFatia(indice),
    };
  });
  return (
    <div className="px-5 pb-4">
      <div className="h-2.5 w-full overflow-hidden rounded-full">
        <svg
          viewBox="0 0 100 4"
          preserveAspectRatio="none"
          className="block h-full w-full"
          role="img"
          aria-label={`Composição das ${total} saídas por categoria de qualidade Meta: ${fatias
            .map((fatia) => `${rotuloCategoria(fatia.category)} ${fatia.count} (${fatia.share}%)`)
            .join(", ")}.`}
        >
          {fatias.map((fatia) => (
            <rect key={fatia.category} x={fatia.x} y="0" width={fatia.largura} height="4" fill={fatia.tinta}>
              <title>{`${rotuloCategoria(fatia.category)} · ${fatia.count} (${fatia.share}%) · chave Meta ${fatia.category}`}</title>
            </rect>
          ))}
        </svg>
      </div>
      {/* A legenda É a faixa de chips que existia aqui — mesmos números, mesmo
          agregado —, sem a borda de cada pílula e com o quadradinho que torna a
          barra decifrável. Chip que não age não precisa de contorno. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5" aria-label="Agregado por categoria de qualidade Meta">
        <span className="cc6-eyebrow text-micro!">Categorias Meta</span>
        {fatias.map((fatia) => (
          <span
            key={fatia.category}
            className="flex items-center gap-1.5 text-rotulo leading-4 text-[var(--atlas-texto-medio)]"
            title={`chave Meta: ${fatia.category}`}
          >
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: fatia.tinta }} />
            {rotuloCategoria(fatia.category)}{" "}
            <Num wrapper="font-semibold">{fatia.count}</Num>
            <Num ink="text-[var(--atlas-texto-medio)]">· {fatia.share}%</Num>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function PipelineDiscardsPage() {
  const [days, setDays] = useState<WindowDays>(30);
  const [report, setReport] = useState<DiscardReport | null>(null);
  const [status, setStatus] = useState<ReportStatus>("loading");

  // Aborta o request anterior ao trocar a janela (7→90 rápido) — sem isso,
  // uma resposta fora de ordem podia exibir dados da janela errada.
  const abortRef = useRef<AbortController | null>(null);

  const loadReport = useCallback(async (window: WindowDays) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre novamente.");
      const response = await fetch(`/api/v1/analytics/discard-report?days=${window}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403) { setStatus("restricted"); return; }
      const payload = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok || payload?.ok !== true) throw new Error("O relatório não pôde ser carregado.");
      setReport(payload.data as DiscardReport);
      setStatus("ready");
    } catch {
      // Abort não é erro: o request mais novo é dono do estado da tela.
      if (controller.signal.aborted) return;
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void loadReport(days);
    return () => abortRef.current?.abort();
  }, [days, loadReport]);

  const loading = status === "loading";
  const hasData = status === "ready" && report !== null && report.totals.discarded > 0;
  const motivoDominante = hasData && report ? report.byReason[0] ?? null : null;
  /** Número existente vira texto; ausente vira traço. Zero é resposta, `null`
   *  e `undefined` não são — e um zero no lugar de "não apurado" pareceria uma
   *  operação saudável. */
  const numero = (valor: number | null | undefined) =>
    loading || valor === null || valor === undefined ? TRACO : String(valor);
  const semMovimento = report?.totals.semMovimentoRegistrado ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-12" data-phase="38-discard-andromeda-report">
      <PageHeader
        eyebrow="Pipeline · Loop Andromeda"
        title="Relatório Andromeda de descartes"
        description="Motivos de perda no padrão Meta CRM lead status — internos até a decisão explícita do diretor de sincronizar."
        action={{ href: "/pipeline", label: "Voltar ao pipeline", priority: "secondary" }}
      />

      {status === "restricted" ? (
        <p className="cc6-panel-quiet cc6-reveal px-4 py-3.5 text-sm leading-6 text-[var(--atlas-texto-medio)]" role="status">
          Relatório liberado para gestor, superintendente e diretor — fale com a gestão da sua operação para receber o consolidado.
        </p>
      ) : null}
      {status === "error" ? <AtlasRecoverableError description="O relatório de descartes está temporariamente indisponível." onRetry={() => void loadReport(days)} busy={loading} scope="page" /> : null}

      {status === "loading" || status === "ready" ? (
        <>
          {/* ── 1 · A LEITURA ────────────────────────────────────────────────
              O que decide fica acima do que informa. Antes, cinco números do
              MESMO tamanho disputavam a atenção — e dois deles carregavam o
              mesmo valor: a rota faz `lostMoves = discarded`, então "descartes"
              e "perdas no funil" eram um número com dois rótulos, lado a lado,
              parecendo duas medições. Agora há UM herói (o volume da perda), a
              frase que diz onde ela se concentra, e uma linha de contexto que
              preserva os cinco rótulos com o denominador à vista. */}
          <section aria-labelledby="discard-taxonomy-title">
            <TiltShell className="cc6-panel cc6-reveal overflow-hidden" delayMs={0}>
              <header className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5">
                <div>
                  <p className="cc6-eyebrow">Taxonomia Meta · contagem por motivo</p>
                  <h2 id="discard-taxonomy-title" className="mt-1 text-lg font-semibold tracking-tight text-[var(--atlas-texto-forte)]">
                    Descartes por motivo
                  </h2>
                </div>
                <div className="flex shrink-0 gap-1.5" role="group" aria-label="Janela do relatório em dias">
                  {WINDOW_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setDays(option)}
                      aria-pressed={days === option}
                      className={`cc6-chip cursor-pointer transition-colors ${
                        days === option
                          ? "border-[color:var(--atlas-accent)]! text-[var(--atlas-texto-forte)]!"
                          : "hover:border-[color-mix(in_srgb,var(--atlas-texto-fraco)_45%,transparent)]! hover:text-[var(--atlas-texto-forte)]!"
                      }`}
                    >
                      {option} dias
                    </button>
                  ))}
                </div>
              </header>

              <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3 px-5 pb-4" aria-label="Totais do período" aria-busy={loading}>
                <div className="shrink-0">
                  <p className="cc6-metric-label">descartes · {days}d</p>
                  <p className={`cc6-metric-value text-heroi leading-none ${hasData ? "cc6-crit" : ""}`}>
                    {loading || !report ? TRACO : String(report.totals.discarded)}
                  </p>
                </div>
                <div className="min-w-0 flex-1 basis-72">
                  {motivoDominante ? (
                    <p className="text-corpo leading-5 text-[var(--atlas-texto-medio)]">
                      Motivo que mais aparece:{" "}
                      <strong className="font-semibold text-[var(--atlas-texto-forte)]">{motivoDominante.label}</strong> —{" "}
                      <Num>{motivoDominante.count}</Num> saída{motivoDominante.count === 1 ? "" : "s"} (
                      <Num>{motivoDominante.share}%</Num>).
                    </p>
                  ) : null}
                  {/* Os cinco rótulos que eram cinco blocos continuam todos aqui —
                      e a cobertura ganhou o denominador que faltava: "0%" sozinho
                      não dizia sobre o quê. */}
                  <p className="mt-1 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                    <Num>{numero(report?.totals.uniqueLeads)}</Num> leads únicos ·{" "}
                    <Num>{numero(report?.totals.classified)}</Num> classificados ·{" "}
                    <Num>{numero(report?.totals.lostMoves)}</Num> perdas no funil ·{" "}
                    <Num>{numero(report?.totals.revertidas)}</Num> revertidas · cobertura das perdas{" "}
                    {!loading && report && report.totals.coveragePct !== null ? (
                      <>
                        {/* `cc6-warn`/`cc6-ok` são as DUAS tintas que sobrevivem ao lado
                            de `cc6-num`: a regra de tema claro delas é declarada depois,
                            com a mesma especificidade. Medido: 4% → âmbar, 82% → verde. */}
                        <strong className={`cc6-num font-semibold ${report.totals.coveragePct >= 80 ? "cc6-ok" : "cc6-warn"}`}>
                          {report.totals.coveragePct}%
                        </strong>{" "}
                        (<Num ink="text-[var(--atlas-texto-medio)]">{report.totals.classified}</Num> de{" "}
                        <Num ink="text-[var(--atlas-texto-medio)]">{report.totals.discarded}</Num> com motivo)
                      </>
                    ) : (
                      <Num ink="text-[var(--atlas-texto-medio)]">{TRACO}</Num>
                    )}
                  </p>

                  {/* ── DADO QUE A ROTA MANDAVA E A TELA NÃO MOSTRAVA ──────────
                      `janelaMaiorQueORegistro` existe no payload desde sempre e
                      nunca foi renderizado: a tela dizia "descartes · 90d" sobre
                      um registro que começou há três dias. Ausência de medição
                      lida como ausência de perda é a mentira mais cara desta
                      tela, e ela só aparecia no estado VAZIO. */}
                  {hasData && report?.procedencia?.janelaMaiorQueORegistro ? (
                    <p className="mt-1.5 text-rotulo leading-4 text-[var(--atlas-estado-atencao)]">
                      A janela pede {days} dias, mas o registro de movimentação começa em{" "}
                      {dataCurta(report.procedencia.registroDeMovimentoDesde)} — os dias anteriores são ausência de
                      medição, não ausência de perda.
                    </p>
                  ) : null}
                  {hasData && semMovimento ? (
                    <p className="mt-1 text-rotulo leading-4 text-[var(--atlas-estado-atencao)]">
                      <Num ink="text-[var(--atlas-estado-atencao)]">{semMovimento}</Num> lead{semMovimento === 1 ? "" : "s"} em estado de saída
                      sem movimento registrado — anteriores ao início do registro, e sem motivo a recuperar. Não entram em
                      nenhuma contagem acima.
                    </p>
                  ) : null}
                </div>
              </div>

              {loading ? (
                <div className="cc6-hairline space-y-2 p-5">
                  {[1, 2, 3].map((item) => (
                    <AtlasSkeleton key={item} className="h-14" />
                  ))}
                </div>
              ) : null}

              {/* ── A FRASE ANTERIOR ERA FALSA ─────────────────────────────
                  Ela dizia: "Nenhum descarte classificado — ao mover uma lead
                  para a etapa de perda no Kanban, o motivo alimenta este
                  relatório." Medido em 2026-07-30: o motivo era EXIGIDO pela
                  rota e descartado antes de gravar, 102 vezes. A tela culpava o
                  time por não classificar enquanto o sistema apagava a escolha.

                  Agora distinguimos três coisas que a frase única confundia:
                  não houve saída · houve saída e nenhuma foi classificada ·
                  houve saída antes do registro existir. */}
              {status === "ready" && report && !hasData ? (
                <div className="cc6-hairline px-5 py-6 text-sm leading-6 text-[var(--atlas-texto-fraco)]">
                  {report.totals.discarded > 0 ? (
                    <>
                      <strong className="text-[var(--atlas-texto-forte)]">
                        {report.totals.discarded} saída{report.totals.discarded === 1 ? "" : "s"} do funil
                      </strong>{" "}
                      na janela, e nenhuma com motivo classificado. O motivo escolhido no Kanban não estava
                      sendo gravado até 30/07/2026 — as saídas anteriores ficam como{" "}
                      <strong className="text-[var(--atlas-texto-forte)]">não medido</strong>, e não há como recuperá-las. A
                      classificação passa a valer das próximas em diante.
                    </>
                  ) : (
                    <>
                      Nenhuma saída do funil registrada nos últimos {days} dias.
                      {report.procedencia?.registroDeMovimentoDesde ? (
                        <>
                          {" "}O registro de movimentação existe desde{" "}
                          {dataCurta(report.procedencia.registroDeMovimentoDesde)} — isto
                          é ausência de saída, não falta de medição.
                        </>
                      ) : null}
                    </>
                  )}
                  {report.totals.semMovimentoRegistrado ? (
                    <>
                      {" "}
                      <span className="text-[var(--atlas-estado-atencao)]">
                        {report.totals.semMovimentoRegistrado} lead
                        {report.totals.semMovimentoRegistrado === 1 ? "" : "s"} em estado de saída sem movimento
                        registrado — anteriores ao início do registro, e sem motivo a recuperar.
                      </span>
                    </>
                  ) : null}{" "}
                  <Link href="/pipeline" className="font-medium text-[color:var(--atlas-accent)] hover:underline">
                    Abrir o pipeline
                  </Link>
                </div>
              ) : null}

              {hasData && report ? (
                <>
                  <ComposicaoMeta categorias={report.byMetaCategory} total={report.totals.discarded} />
                  <div className="flex flex-col">
                    {report.byReason.map((item, index) => (
                      <article
                        key={item.key}
                        className="cc6-reveal relative isolate flex items-center gap-4 overflow-hidden px-5 py-3"
                        style={{ animationDelay: `${80 + Math.min(index, 8) * 45}ms` }}
                      >
                        <span aria-hidden="true" className="absolute inset-y-[3px] left-0 -z-10 rounded-r-[3px]" style={faixaDeShare(item.share)} />
                        <span className="cc6-metric-value w-10 shrink-0 text-right text-numero">{item.count}</span>
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="text-corpo leading-5 font-medium break-words text-[var(--atlas-texto-forte)]">{item.label}</p>
                          <StatusBadge tone="violet">{rotuloCategoria(item.metaCategory)}</StatusBadge>
                        </div>
                        <Num wrapper="shrink-0 text-rotulo" ink="text-[var(--atlas-texto-medio)]">{item.share}%</Num>
                      </article>
                    ))}
                  </div>
                </>
              ) : null}
            </TiltShell>
          </section>

          {hasData && report ? (
            <>
              {/* ── 2 · ONDE A PERDA NASCE ────────────────────────────────────
                  Eram dois painéis irmãos, cada um com eyebrow + título (quatro
                  rótulos para duas listas) e uma hairline por linha — até 24
                  filetes só aqui. Uma superfície, duas colunas, e a faixa de
                  share no lugar dos filetes: a comparação entre origem e
                  campanha passa a ser lado a lado de verdade. */}
              <section className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "120ms" }} aria-labelledby="discard-origin-title">
                <header className="px-5 pt-5 pb-3">
                  <p className="cc6-eyebrow">Origem do lead · Mídia paga</p>
                  <h2 id="discard-origin-title" className="mt-1 text-sm font-semibold tracking-tight text-[var(--atlas-texto-forte)]">
                    Onde nascem as leads descartadas
                  </h2>
                </header>
                <div className="grid gap-x-4 gap-y-2 md:grid-cols-2">
                  <div>
                    <h3 className="cc6-eyebrow px-5 pb-1 text-micro!">Origem</h3>
                    {report.bySource.map((item, index) => (
                      <LinhaDeOrigem
                        key={item.source}
                        nome={item.source}
                        count={item.count}
                        share={item.share}
                        item={item}
                        atraso={140 + Math.min(index, 8) * 35}
                      />
                    ))}
                  </div>
                  <div>
                    <h3 className="cc6-eyebrow px-5 pb-1 text-micro!">Campanhas com leads descartadas</h3>
                    {report.byCampaign.map((item, index) => (
                      <LinhaDeOrigem
                        key={item.campaignId ?? "sem_campanha"}
                        nome={item.campaign || item.campaignId || "Sem campanha"}
                        count={item.count}
                        share={item.share}
                        item={item}
                        atraso={160 + Math.min(index, 8) * 35}
                      />
                    ))}
                  </div>
                </div>
              </section>

              {/* ── 3 · O QUE AUDITA DESCE E RECOLHE ──────────────────────────
                  Política, gate do diretor e prontidão de sync são constantes de
                  governança: nenhuma delas muda o que o gestor faz nos próximos
                  cinco minutos. Vão para o `<details>` NATIVO — o mesmo recurso
                  recolhível que /sales, /tasks e /marketing já usam —, com o
                  estado do gate visível no resumo para não precisar abrir.

                  A procedência inteira entra junto: `fonte`, `estagiosContados`,
                  `registroDeMovimentoDesde`, `motivoGravadoDesde` e o `period`
                  chegavam no payload e não eram exibidos em lugar nenhum. */}
              <details className="cc6-panel-quiet cc6-reveal group px-4 pb-1" style={{ animationDelay: "200ms" }}>
                <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--atlas-accent)]">
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                    <span className="cc6-eyebrow">Governança</span>
                    <span className="text-corpo font-semibold text-[var(--atlas-texto-forte)]">Status do loop Andromeda</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <StatusBadge tone={report.andromeda.readyForCrmLeadStatusSync ? "success" : "neutral"}>
                      {report.andromeda.readyForCrmLeadStatusSync ? "Sim · cobertura ≥ 80%" : "Ainda não · cobertura < 80%"}
                    </StatusBadge>
                    <span className="text-micro leading-4 text-[var(--atlas-texto-medio)] group-open:hidden">abrir</span>
                    <span className="hidden text-micro leading-4 text-[var(--atlas-texto-medio)] group-open:inline">fechar</span>
                  </span>
                </summary>
                <div className="flex flex-col pb-2">
                  <div className="cc6-hairline flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <span className="text-rotulo text-[var(--atlas-texto-medio)]">Política de sinais negativos</span>
                    <StatusBadge tone="info">Interno até decisão</StatusBadge>
                  </div>
                  <div className="cc6-hairline flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <span className="text-rotulo text-[var(--atlas-texto-medio)]">Decisão do diretor</span>
                    <StatusBadge tone={report.andromeda.directorDecisionRequired ? "warning" : "success"}>
                      {report.andromeda.directorDecisionRequired ? "Obrigatória" : "Dispensada"}
                    </StatusBadge>
                  </div>
                  <div className="cc6-hairline flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <span className="text-rotulo text-[var(--atlas-texto-medio)]">Pronto para sincronizar CRM lead status</span>
                    <StatusBadge tone={report.andromeda.readyForCrmLeadStatusSync ? "success" : "neutral"}>
                      {report.andromeda.readyForCrmLeadStatusSync ? "Sim · cobertura ≥ 80%" : "Ainda não · cobertura < 80%"}
                    </StatusBadge>
                  </div>
                  <dl className="cc6-hairline mt-1 grid gap-x-6 gap-y-1 pt-2.5 text-micro leading-4 sm:grid-cols-2">
                    <div className="flex flex-wrap gap-x-1.5">
                      <dt className="text-[var(--atlas-texto-medio)]">Fonte:</dt>
                      <dd className="text-[var(--atlas-texto-forte)]">{report.procedencia?.fonte ?? TRACO}</dd>
                    </div>
                    <div className="flex flex-wrap gap-x-1.5">
                      <dt className="text-[var(--atlas-texto-medio)]">Estágios contados:</dt>
                      <dd className="text-[var(--atlas-texto-forte)]">
                        {report.procedencia?.estagiosContados?.length ? report.procedencia.estagiosContados.join(", ") : TRACO}
                      </dd>
                    </div>
                    <div className="flex flex-wrap gap-x-1.5">
                      <dt className="text-[var(--atlas-texto-medio)]">Registro de movimentação desde:</dt>
                      <dd className="cc6-num"><span className="text-[var(--atlas-texto-forte)]">{dataCurta(report.procedencia?.registroDeMovimentoDesde)}</span></dd>
                    </div>
                    <div className="flex flex-wrap gap-x-1.5">
                      <dt className="text-[var(--atlas-texto-medio)]">Motivo gravado desde:</dt>
                      <dd className="cc6-num"><span className="text-[var(--atlas-texto-forte)]">{report.procedencia?.motivoGravadoDesde ?? TRACO}</span></dd>
                    </div>
                    <div className="flex flex-wrap gap-x-1.5 sm:col-span-2">
                      <dt className="text-[var(--atlas-texto-medio)]">Janela apurada:</dt>
                      <dd className="cc6-num">
                        <span className="text-[var(--atlas-texto-forte)]">
                          {dataCurta(report.period.start)} → {dataCurta(report.period.end)}
                        </span>
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-1.5 text-micro leading-4 text-[var(--atlas-texto-medio)]">
                    Gerado em{" "}
                    {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(report.generatedAt))}{" "}
                    · taxonomia v{report.andromeda.taxonomyVersion}.
                  </p>
                </div>
              </details>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
