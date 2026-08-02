"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { PageHeader } from "@/components/atlas/page-header";

/*
 * RELATÓRIOS EXECUTIVOS MULTICANAL — passada de identidade e de lastro.
 *
 * ── O QUE ESTA TELA ERA ────────────────────────────────────────────────────
 * Uma linha minificada com herói em gradiente `slate-950 → blue-950 →
 * sky-950`, texto `text-white`/`text-slate-300` e cartões `bg-white`. Nenhuma
 * dessas cores é token, então NENHUMA vira com o tema: no tema escuro cada
 * relatório era um retângulo BRANCO no meio do painel escuro. Quatro famílias
 * de raio decidindo o mesmo assunto (`rounded-[30px]`, `rounded-3xl`,
 * `rounded-2xl`, `rounded-full`) e cinco degraus tipográficos fora da escala
 * de 11/13/20/34 — 30px, 20px, 18px, 14px e 12px.
 *
 * ── E O QUE ELA DIZIA SEM LASTRO ───────────────────────────────────────────
 * `buildExecutiveMarketingReport` calcula `sampleSufficient` e emite o alerta
 * `amostra_global_insuficiente` justamente porque taxa sobre amostra pequena
 * não é leitura confiável. A tela recebia os dois e desenhava o alerta como
 * pastilha âmbar com a CHAVE CRUA — "amostra global insuficiente" — no meio de
 * outras três, sem dizer o que aquilo muda na leitura. O aviso existia e não
 * avisava. E `brl(Number(v||0))` transformava dinheiro NÃO MEDIDO em R$ 0.
 *
 * ── O QUE NÃO MUDOU ────────────────────────────────────────────────────────
 * Fetch, ações, contrato da API e todas as frases visíveis. Nada aqui executa
 * decisão: gerar registra o relatório, revisar exige justificativa humana.
 */

type Summary = {
  spend: number | null;
  leads: number | null;
  qualified: number | null;
  wins: number | null;
  roas: number | null;
  sampleSufficient?: boolean | null;
};

type Report = {
  id: string;
  period_type: string;
  period_start: string;
  period_end: string;
  status: string;
  payload: {
    summary: Summary;
    alerts: string[];
    campaigns: Array<Record<string, unknown>>;
    projects: Array<Record<string, unknown>>;
    developers: Array<Record<string, unknown>>;
  };
};

/* ── DINHEIRO NÃO MEDIDO NÃO É R$ 0 ────────────────────────────────────────
   O formatador anterior era `Number(v||0)`: nulo, indefinido e ausente viravam
   R$ 0 — e "Investimento R$ 0" se lê como "não gastamos nada", que é o oposto
   de "ninguém mediu". Precedente já pago em `/sales` e em `/reports`: ausência
   devolve `null`, e quem desenha decide a frase do que falta. */
const brl = (value: number | null | undefined) =>
  value == null || !Number.isFinite(Number(value))
    ? null
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(value));
const inteiro = (value: number | null | undefined) =>
  value == null || !Number.isFinite(Number(value)) ? null : String(Math.round(Number(value)));
const dia = (iso: string) => {
  const marca = Date.parse(iso);
  return Number.isFinite(marca) ? new Date(marca).toLocaleDateString("pt-BR") : iso;
};

/* O enum da API é inglês; a tela é de um CRM brasileiro. O recuo devolve a
   chave crua em vez de inventar rótulo para um período que eu não conheço. */
const PERIODO: Record<string, string> = { day: "Dia", week: "Semana", month: "Mês" };

/* ── O ÚNICO EMOJI DESTA TELA ──────────────────────────────────────────────
   `status` é o ESTADO do relatório, e a lista é lida em VARREDURA vertical —
   dia, semana e mês empilhados, até 90 registros. Até aqui o único canal era a
   palavra, e ela saía na MESMA tinta azul para os dois estados: "ready" e
   "reviewed" tinham exatamente a mesma aparência, e ainda em inglês. Quem
   entra para achar o que falta revisar tinha de ler cada linha inteira.

   O símbolo acrescenta FORMA — reconhecível de relance e sobrevivente em
   escala de cinza, que é justamente o que a cor não faz para quem tem baixa
   visão de cor. Não acrescento cor junto: seria um terceiro canal dizendo a
   mesma coisa, a redundância que este passe removeu em outros lugares.

   `aria-hidden` porque a palavra em pt-BR vem imediatamente ao lado — o leitor
   de tela deve ouvir "aguarda revisão", não "ampulheta aguarda revisão". */
const ESTADO: Record<string, { emoji: string; label: string }> = {
  ready: { emoji: "⏳", label: "aguarda revisão" },
  reviewed: { emoji: "✅", label: "revisado" },
};

/* ── OS ALERTAS ERAM CHAVES, NÃO AVISOS ────────────────────────────────────
   `a.replaceAll("_"," ")` transformava `investimento_sem_lead_crm` em
   "investimento sem lead crm". É telegrama de banco de dados exposto a quem
   decide verba. Cada chave vira frase, e a severidade separa o que é ressalva
   de leitura do que é dinheiro queimando.

   Chave desconhecida cai no comportamento ANTIGO (troca de `_` por espaço) em
   vez de sumir: um alerta novo do backend precisa aparecer mesmo antes de
   alguém escrever a frase dele aqui. */
const ALERTA: Record<string, { texto: string; grave: boolean }> = {
  amostra_global_insuficiente: {
    texto: "Amostra insuficiente no período — com esta quantidade de leads, uma venda a mais ou a menos muda a taxa de forma desproporcional. Leia os números como indício, não como medida.",
    grave: false,
  },
  investimento_sem_lead_crm: {
    texto: "Houve investimento no período e nenhuma lead chegou ao CRM. Confira a integração antes de concluir qualquer coisa sobre a campanha.",
    grave: true,
  },
  projeto_com_gasto_sem_lead: {
    texto: "Ao menos um projeto registrou gasto e nenhuma lead no CRM no período.",
    grave: true,
  },
  campanha_com_amostra_sem_venda: {
    texto: "Ao menos uma campanha tem amostra suficiente e nenhuma venda registrada.",
    grave: false,
  },
};

const GERAR: Array<[string, string]> = [["day", "Gerar dia"], ["week", "Gerar semana"], ["month", "Gerar mês"]];
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";

export default function Page() {
  const [reports, setReports] = useState<Report[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState("");
  const [aviso, setAviso] = useState("");
  const [avisoGrave, setAvisoGrave] = useState(false);

  const load = useCallback(async () => {
    const resposta = await fetch("/api/v1/analytics/executive-marketing", { cache: "no-store" });
    const corpo = await resposta.json();
    if (!resposta.ok) throw new Error(corpo?.error?.message || "Indisponível");
    setReports(corpo.data.reports);
  }, []);

  useEffect(() => {
    load()
      .catch((causa) => { setAviso(causa instanceof Error ? causa.message : "Indisponível"); setAvisoGrave(true); })
      .finally(() => setCarregando(false));
  }, [load]);

  async function act(body: Record<string, unknown>, ocupadoCom: string) {
    setOcupado(ocupadoCom);
    setAviso("");
    setAvisoGrave(false);
    try {
      const resposta = await fetch("/api/v1/analytics/executive-marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo?.error?.message || "Falha");
      setAviso("Relatório registrado sem executar decisões automáticas.");
      await load();
    } catch (causa) {
      setAviso(causa instanceof Error ? causa.message : "Falha");
      setAvisoGrave(true);
    } finally {
      setOcupado("");
    }
  }

  return (
    <div className="space-y-4 pb-10" data-phase="96-multichannel-executive-reports">
      <PageHeader
        eyebrow="DIA · SEMANA · MÊS"
        title="Relatórios executivos multicanal"
        description="Campanhas, projetos e incorporadoras com resultado confirmado no CRM."
      />

      <section className="cc6-panel cc6-reveal p-4 sm:p-5" aria-labelledby="gerar-titulo">
        <h2 id="gerar-titulo" className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-corpo font-semibold tracking-tight text-[var(--atlas-texto-forte)]">
          <span className="cc6-eyebrow">Gerar relatório</span>
          <span>Consolidar o período a partir dos fatos multicanal</span>
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {GERAR.map(([chave, rotulo]) => (
            <button
              key={chave}
              type="button"
              disabled={Boolean(ocupado)}
              aria-busy={ocupado === chave}
              onClick={() => void act({ action: "generate", periodType: chave }, chave)}
              className={`cc6-ghost-btn min-h-11 disabled:opacity-50 ${focusRing}`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        {/* ── O ESTADO DE CARREGAMENTO NÃO PODE PULAR O LAYOUT ─────────────
            O rótulo do botão NÃO troca: "Gerar semana" → "Gerando…" encolheria
            o botão e empurraria os vizinhos no meio do clique. A faixa de aviso
            é que existe SEMPRE, com altura reservada, e é ela que fala. Vazia,
            é espaço; ocupada, é a única coisa que mudou de lugar nenhum. */}
        <p
          role="status"
          aria-live="polite"
          className={`mt-3 min-h-5 text-corpo leading-5 ${avisoGrave ? "text-[var(--atlas-estado-perigo)]" : "text-[var(--atlas-texto-medio)]"}`}
        >
          {ocupado ? `Gerando o relatório de ${(PERIODO[ocupado] ?? ocupado).toLocaleLowerCase("pt-BR")}…` : aviso}
        </p>
      </section>

      {carregando ? (
        <div className="space-y-3" aria-busy="true">
          {[1, 2, 3].map((item) => <AtlasSkeleton key={item} className="h-40" />)}
        </div>
      ) : reports.length === 0 ? (
        <div className="cc6-panel p-5">
          <AtlasEmpty
            reason="first-use"
            eyebrow="Nenhum período consolidado"
            title="Ainda não há relatório executivo gerado"
            description="Gere o dia, a semana ou o mês para consolidar campanhas, projetos e incorporadoras a partir dos fatos multicanal."
          />
        </div>
      ) : null}

      <div className="space-y-4">
        {reports.map((relatorio, indice) => {
          const resumo = relatorio.payload.summary;
          const estado = ESTADO[relatorio.status];
          /* `sampleSufficient` é a fonte da verdade sobre a amostra e vem do
             mesmo módulo que emite o alerta. O piso numérico NÃO é repetido
             aqui: dois lugares declarando o mesmo limiar é o caminho para os
             dois divergirem sem ninguém perceber. */
          /* ── UMA AMOSTRA FRÁGIL, UM AVISO SÓ ────────────────────────────
             `buildExecutiveMarketingReport` (lib/analytics/multichannel-
             executive-report.ts) emite `amostra_global_insuficiente` sob a
             condição `leads > 0 && !sampleSufficient` — quase exatamente a
             mesma que acende esta linha. Sem a segunda metade do teste, todo
             relatório com 1 a 29 leads imprimia DOIS parágrafos vizinhos
             dizendo a mesma coisa: a redundância que este arquivo remove em
             outros lugares, cometida aqui.

             A linha continua existindo para o caso que o alerta NÃO cobre —
             zero lead no período, onde `sampleSufficient` é falso e nenhum
             alerta é emitido. */
          const alertaDeAmostra = relatorio.payload.alerts.includes("amostra_global_insuficiente");
          const amostraFragil = resumo.sampleSufficient === false && !alertaDeAmostra;
          const numeros: Array<[string, string | null, string]> = [
            ["Investimento", brl(resumo.spend), "não medido no período"],
            ["Leads", inteiro(resumo.leads), "não medido no período"],
            ["Qualificadas", inteiro(resumo.qualified), "não medido no período"],
            ["Vendas", inteiro(resumo.wins), "não medido no período"],
            ["ROAS", resumo.roas == null ? null : `${resumo.roas}x`, "sem investimento registrado, não há razão a calcular"],
          ];
          return (
            <article
              key={relatorio.id}
              className="cc6-panel cc6-reveal p-4 sm:p-5"
              style={{ animationDelay: `${Math.min(indice, 6) * 40}ms` }}
              aria-labelledby={`relatorio-${relatorio.id}`}
            >
              <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                <h3 id={`relatorio-${relatorio.id}`} className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-corpo font-semibold tracking-tight text-[var(--atlas-texto-forte)]">
                  <span className="cc6-eyebrow">{PERIODO[relatorio.period_type] ?? relatorio.period_type}</span>
                  <span>{dia(relatorio.period_start)} a {dia(relatorio.period_end)}</span>
                  <span className="cc6-chip font-normal">
                    {estado ? <span aria-hidden="true">{estado.emoji}</span> : null}
                    {estado?.label ?? relatorio.status}
                  </span>
                </h3>
                {relatorio.status === "ready" ? (
                  <button
                    type="button"
                    disabled={Boolean(ocupado)}
                    aria-busy={ocupado === relatorio.id}
                    onClick={() => void act({ action: "review", reportId: relatorio.id, reason: "Indicadores, alertas e fontes revisados pela diretoria." }, relatorio.id)}
                    /* Preenchido, e não fantasma: é a única ação que MUDA
                       ESTADO nesta lista, e o desenho anterior (pílula azul
                       sólida) já dizia isso — só que com 32px de altura e um
                       azul cravado. A primitiva devolve os 44px e o token.
                       `atlas-button-secondary` foi descartado aqui porque, no
                       tema claro, ele perde borda e fundo e passa a se ler como
                       link de texto — MEDIDO no navegador. */
                    className={`atlas-button-primary shrink-0 disabled:opacity-50 ${focusRing}`}
                  >
                    Marcar revisado
                  </button>
                ) : null}
              </header>

              <div className="mt-4 flex flex-wrap gap-x-10 gap-y-4">
                {numeros.map(([rotulo, valor, ausente]) => (
                  <div key={rotulo} className="min-w-0">
                    {valor === null ? (
                      <p className="cc6-warn text-rotulo font-semibold leading-none">sem lastro</p>
                    ) : (
                      <p className="cc6-metric-value text-numero leading-none">{valor}</p>
                    )}
                    <p className="cc6-metric-label mt-1.5">{rotulo}</p>
                    {valor === null ? (
                      <p className="mt-0.5 max-w-52 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">{ausente}</p>
                    ) : null}
                  </div>
                ))}
              </div>

              {/* O lastro da leitura INTEIRA, e não de um número só: com amostra
                  pequena todas as taxas deste relatório ficam frágeis ao mesmo
                  tempo, porque saem do mesmo denominador. */}
              {amostraFragil ? (
                <p className="cc6-hairline mt-4 pt-3 text-rotulo leading-5 text-[var(--atlas-estado-atencao)]">
                  Amostra pequena neste período — as taxas derivadas destes números oscilam muito com uma venda a mais ou a menos.
                </p>
              ) : null}

              {relatorio.payload.alerts.length ? (
                /* Sem emoji nesta lista: são todos alertas do mesmo tipo de
                   coisa, e se todos têm um símbolo, nenhum informa. O que os
                   separa é CONSEQUÊNCIA — dinheiro queimando contra ressalva de
                   leitura — e isso a banda de severidade já diz. */
                <div className="mt-4 grid gap-2">
                  {relatorio.payload.alerts.map((chave) => {
                    const alerta = ALERTA[chave];
                    const grave = alerta?.grave ?? false;
                    return (
                      <p
                        key={chave}
                        className={`cc6-sev-band cc6-panel-quiet py-2.5 pl-4 pr-3 text-corpo leading-5 ${grave ? "text-[var(--atlas-estado-perigo)]" : "text-[var(--atlas-estado-atencao)]"}`}
                        style={{ "--cc6-sev": grave ? "var(--atlas-estado-perigo)" : "var(--atlas-estado-atencao)" } as CSSProperties}
                      >
                        {alerta?.texto ?? chave.replaceAll("_", " ")}
                      </p>
                    );
                  })}
                </div>
              ) : null}

              {/* Três contagens do mesmo tipo, lado a lado. Eram três caixas com
                  borda, e a borda não separava nada que o espaço já não
                  separasse. */}
              <div className="cc6-hairline mt-4 flex flex-wrap gap-x-10 gap-y-3 pt-3">
                {([
                  ["campanhas", relatorio.payload.campaigns.length, "analisadas"],
                  ["projetos", relatorio.payload.projects.length, "consolidados"],
                  ["incorporadoras", relatorio.payload.developers.length, "consolidadas"],
                ] as const).map(([rotulo, total, verbo]) => (
                  <p key={rotulo} className="text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
                    <strong className="cc6-num font-semibold text-[var(--atlas-texto-forte)]">{total}</strong>{" "}
                    {rotulo} {verbo}
                  </p>
                ))}
              </div>
            </article>
          );
        })}
      </div>

      <p className="cc6-reveal text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
        O CRM é a fonte de verdade da conversão; fatos e alertas viajam separados e nenhum relatório muda verba, campanha ou registro — a revisão é sempre da diretoria.
      </p>
    </div>
  );
}
