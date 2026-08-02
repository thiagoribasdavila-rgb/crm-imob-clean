"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";

/*
 * REVENUE ENGINE — a tela que desenhava doze zeros que ninguém mediu.
 *
 * ── O DEFEITO, E ELE ESTAVA NO PAYLOAD ─────────────────────────────────────
 * `app/api/v1/revenue-engine/route.ts` conta linhas assim:
 *
 *     return error ? { value: 0, available: false }
 *                  : { value: count || 0, available: true };
 *     } catch { return { value: 0, available: false }; }
 *
 * Ou seja: quando a tabela NÃO EXISTE nesta base, ou a consulta falha, a API
 * devolve honestamente `available: false` — e um `value: 0` que só existe
 * porque o tipo exige um número. A tela lia `summary.X.value` e ignorava
 * `available` nas seis métricas e nas seis etapas do funil. Doze números
 * "medidos" em zero, indistinguíveis de doze leituras que nunca aconteceram.
 *
 * "Jornadas IA: 0" se lê como "a IA não atendeu ninguém". O que aconteceu foi
 * "não consegui ler a tabela `ai_sales_journeys`". São diagnósticos opostos e
 * levam a decisões opostas — um manda cobrar a operação, o outro manda chamar
 * quem cuida do banco.
 *
 * ── A COR TAMBÉM NÃO VIRAVA ────────────────────────────────────────────────
 * `text-white`, `text-slate-300/400`, `text-cyan-300`, `border-cyan-300/10` e
 * um gradiente `blue/indigo/violet` — nenhum é token, então nenhum responde ao
 * tema claro. Mais quatro degraus fora da escala de 11/13/20/34: 60px, 36px,
 * 24px e 14px. Tudo passa a sair de token e da escala.
 *
 * Nada some: todas as frases, os três selos, os três atalhos, os quatro passos
 * do Night Sales e os rótulos das métricas continuam onde estavam.
 */

type State = { state: "operational" | "configured" | "pending" | "blocked"; detail: string };
type Metric = { value: number; available: boolean };
type Payload = {
  infrastructure: Record<string, State>;
  policy: Record<string, unknown>;
  summary: Record<string, Metric>;
  funnel: Array<{ key: string; label: string; value: number }>;
};

const LABELS: Record<string, string> = {
  metaApi: "Meta API",
  leadAds: "Lead Ads",
  webhook: "Webhook",
  conversionApi: "Conversion API",
  andromeda: "Feedback Andromeda",
  nightSales: "Sales Desk 24/7",
};

/* O enum da API é inglês e vinha impresso cru no selo — "operational",
   "blocked" — numa tela em português. Palavra em pt-BR + tom semântico; sem
   emoji, porque cor e palavra já são dois canais e um terceiro símbolo aqui
   seria a redundância que este passe removeu de outros lugares. */
const ESTADO: Record<State["state"], { rotulo: string; tone: "success" | "info" | "warning" | "danger" }> = {
  operational: { rotulo: "operacional", tone: "success" },
  configured: { rotulo: "configurado", tone: "info" },
  pending: { rotulo: "pendente", tone: "warning" },
  blocked: { rotulo: "bloqueado", tone: "danger" },
};

/* ── DE QUAL LEITURA CADA ETAPA DO FUNIL DEPENDE ───────────────────────────
   A rota monta o funil a partir de três fontes: `leads` para a primeira etapa,
   `ai_sales_journeys` para "Contato realizado" e `meta_conversion_events` para
   as demais. O payload do funil NÃO carrega `available` — mas o `summary`
   carrega, para as MESMAS três fontes. Este mapa liga uma coisa à outra.

   Limite honesto, e ele fica escrito na tela: a disponibilidade que eu tenho é
   a da leitura AGREGADA de cada fonte. Uma etapa marcada como não medida quer
   dizer "a fonte dela não pôde ser lida", não "esta contagem específica
   falhou". É menos do que eu gostaria de afirmar, e mais do que zero afirma. */
const FONTE_DA_ETAPA: Record<string, string> = {
  Lead: "leads",
  Contact: "journeys",
  QualifiedLead: "conversions",
  Schedule: "conversions",
  SubmitApplication: "conversions",
  ConvertedLead: "conversions",
};

const SELOS: Array<[string, "success" | "info" | "violet"]> = [
  ["CONVERSÃO 24/7", "success"],
  ["META + CRM", "info"],
  ["HUMANO NO CONTROLE", "violet"],
];

const ATALHOS: Array<[string, string]> = [
  ["/leads/nightly-handoffs", "Abrir handoffs da manhã"],
  ["/integrations/meta/andromeda", "Qualidade dos sinais Meta"],
  ["/leads/reactivation-governance", "Reativar base"],
];

const NIGHT_SALES = [
  "Consentimento, opt-out, telefone e template são validados.",
  "Projeto e materiais atuais entram no contexto.",
  "A IA prepara a qualificação e registra o que aprendeu.",
  "Pela manhã, o corretor exclusivo recebe resumo e próxima ação.",
];

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";

/** `null` = a fonte não pôde ser lida. Nunca zero: zero é uma medida. */
const medido = (metrica: Metric | undefined) =>
  metrica && metrica.available ? metrica.value.toLocaleString("pt-BR") : null;

export default function RevenueEnginePage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return;
    const response = await fetch("/api/v1/revenue-engine", { headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json();
    if (response.ok) setData(payload.data);
    else setError(payload.error?.message || "Revenue Engine temporariamente indisponível.");
  }, []);

  useEffect(() => { void load(); }, [load]);

  const resumo = data?.summary;
  const naoLidas = resumo
    ? Object.entries(resumo).filter(([, metrica]) => !metrica?.available).map(([chave]) => chave)
    : [];

  /* ── A MARCA DE MOMENTO VOLTOU ─────────────────────────────────────────────
     Quarto item da tupla. `AtlasMetric` recebia `trend` e o DESENHAVA
     (`components/ui/AtlasCard.tsx`, `<span className="atlas-metric-trend">`):
     ENTRADA, 24/7, MANHÃ, FEEDBACK e PROTEGIDO eram texto visível na tela. A
     reescrita trocou a primitiva e deixou os cinco pelo caminho sem declarar a
     perda — o cabeçalho deste arquivo chegou a afirmar o contrário ("nada
     some"). Não é rótulo repetido: diz QUANDO o número acontece, que é
     justamente o que "Leads · 30 dias" e "Handoffs" não dizem. Volta em
     `--text-rotulo` (11px, degrau da escala) e em tinta fraca, porque é
     carimbo de auditoria, não conteúdo. */
  const numeros: Array<[string, string | null, string, string]> = [
    ["Leads · 30 dias", medido(resumo?.leads), "Recebidos na operação", "ENTRADA"],
    ["Jornadas IA", medido(resumo?.journeys), "Atendimentos preparados", "24/7"],
    ["Handoffs", medido(resumo?.handoffs), "Contexto entregue ao corretor", "MANHÃ"],
    [
      "Eventos Meta",
      medido(resumo?.delivered),
      resumo?.conversions?.available
        ? `${resumo.conversions.value.toLocaleString("pt-BR")} eventos registrados`
        : "total de eventos não medido",
      "FEEDBACK",
    ],
  ];

  return (
    <div className="space-y-4 pb-10" data-product="atlas-ai-revenue-engine">
      <PageHeader
        eyebrow="Revenue engine · Conversão 24/7"
        title="Nenhuma oportunidade esfria sem resposta."
        description="O Atlas recebe, prioriza e prepara a conversa; o corretor assume com contexto, próxima ação e histórico. À noite, a operação funciona das 22h às 07h com consentimento, template oficial e aprovação."
      />

      <section className="flex flex-wrap items-center gap-2" aria-label="Garantias do motor de receita">
        {SELOS.map(([texto, tone]) => (
          <StatusBadge key={texto} tone={tone}>{texto}</StatusBadge>
        ))}
      </section>

      <nav className="flex flex-wrap gap-2" aria-label="Atalhos do motor de receita">
        {ATALHOS.map(([href, rotulo]) => (
          <Link key={href} href={href} className={`cc6-ghost-btn min-h-11 ${focusRing}`}>{rotulo}</Link>
        ))}
      </nav>

      {error ? (
        <div className="cc6-panel p-5">
          <AtlasEmpty
            reason="no-activity"
            eyebrow="Motor em preparação"
            title="Revenue Engine em preparação"
            description={error}
            action={<button type="button" className={`atlas-button-secondary ${focusRing}`} onClick={() => void load()}>Tentar novamente</button>}
          />
        </div>
      ) : null}

      {!data && !error ? <AtlasSkeleton className="h-72 w-full" /> : null}

      {data ? (
        <>
          <section className="cc6-panel cc6-reveal p-4 sm:p-5" aria-labelledby="resumo-titulo">
            <h2 id="resumo-titulo" className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-corpo font-semibold tracking-tight text-[var(--atlas-texto-forte)]">
              <span className="cc6-eyebrow">Últimos 30 dias</span>
              <span>O que entrou, o que a IA preparou e o que voltou para a Meta</span>
            </h2>
            <div className="mt-4 flex flex-wrap gap-x-10 gap-y-4">
              {numeros.map(([rotulo, valor, detalhe, marca]) => (
                <div key={rotulo} className="min-w-0">
                  {valor === null ? (
                    <p className="cc6-warn text-rotulo font-semibold leading-none">não medido</p>
                  ) : (
                    <p className="cc6-metric-value text-numero leading-none">{valor}</p>
                  )}
                  <p className="cc6-metric-label mt-1.5">
                    {rotulo} <span className="font-mono font-normal tracking-[.12em] text-[var(--atlas-texto-fraco)]">{marca}</span>
                  </p>
                  <p className="mt-0.5 max-w-56 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
                    {valor === null ? "a fonte deste número não pôde ser lida" : detalhe}
                  </p>
                </div>
              ))}
            </div>
            {naoLidas.length ? (
              <p className="cc6-hairline mt-4 pt-3 text-rotulo leading-5 text-[var(--atlas-estado-atencao)]">
                {naoLidas.length} de {Object.keys(resumo ?? {}).length} leituras falharam nesta base. Onde a leitura falha, nenhum número é exibido —
                zero se lê como &ldquo;não aconteceu&rdquo;, e o que houve foi &ldquo;não consegui medir&rdquo;.
              </p>
            ) : null}
          </section>

          <section className="cc6-panel cc6-reveal p-4 sm:p-5" aria-labelledby="auditoria-titulo">
            <h2 id="auditoria-titulo" className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-corpo font-semibold tracking-tight text-[var(--atlas-texto-forte)]">
              <span className="cc6-eyebrow">Auditoria viva</span>
              <span>Meta, Andromeda e atendimento</span>
            </h2>
            <p className="mt-1 max-w-3xl text-corpo leading-6 text-[var(--atlas-texto-medio)]">
              Credencial detectada não significa integração aprovada: o status só evolui após teste real.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Object.entries(data.infrastructure).map(([chave, item]) => {
                const estado = ESTADO[item.state];
                return (
                  <article key={chave} className="cc6-panel-quiet p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <b className="text-corpo font-semibold text-[var(--atlas-texto-forte)]">{LABELS[chave] || chave}</b>
                      <StatusBadge tone={estado?.tone ?? "neutral"}>{estado?.rotulo ?? item.state}</StatusBadge>
                    </div>
                    <p className="mt-2 text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">{item.detail}</p>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="cc6-panel cc6-reveal p-4 sm:p-5" aria-labelledby="funil-titulo">
            <h2 id="funil-titulo" className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-corpo font-semibold tracking-tight text-[var(--atlas-texto-forte)]">
              <span className="cc6-eyebrow">Da mídia à receita</span>
              <span>Funil de aprendizado</span>
            </h2>
            <p className="mt-1 max-w-3xl text-corpo leading-6 text-[var(--atlas-texto-medio)]">
              A Meta aprende com resultados profundos; o Atlas preserva a decisão e o contexto comercial.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {data.funnel.map((etapa, indice) => {
                const fonte = FONTE_DA_ETAPA[etapa.key];
                const legivel = fonte ? resumo?.[fonte]?.available !== false : true;
                return (
                  <article key={etapa.key} className="cc6-panel-quiet p-4">
                    <span className="cc6-num text-rotulo font-semibold text-[color:var(--atlas-accent-hover)]" aria-hidden="true">
                      {String(indice + 1).padStart(2, "0")}
                    </span>
                    <p className="mt-1 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">{etapa.label}</p>
                    {legivel ? (
                      <strong className="cc6-metric-value mt-2 block text-numero leading-none">
                        {etapa.value.toLocaleString("pt-BR")}
                      </strong>
                    ) : (
                      <strong className="cc6-warn mt-2 block text-rotulo font-semibold leading-none">não medido</strong>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <article className="cc6-panel cc6-reveal p-4 sm:p-5" aria-labelledby="night-titulo">
              <h2 id="night-titulo" className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-corpo font-semibold tracking-tight text-[var(--atlas-texto-forte)]">
                <span className="cc6-eyebrow">Night Sales · 22h–07h</span>
                <span>Acolher, descobrir e qualificar</span>
              </h2>
              <p className="mt-1 text-corpo leading-6 text-[var(--atlas-texto-medio)]">
                Sem proposta automática, sem troca silenciosa de corretor e sem mensagem fora das regras.
              </p>
              <ol className="mt-4 space-y-2">
                {NIGHT_SALES.map((passo, indice) => (
                  <li key={passo} className="flex gap-3 text-corpo leading-6 text-[var(--atlas-texto-medio)]">
                    <span className="cc6-num shrink-0 text-rotulo text-[var(--atlas-texto-fraco)]" aria-hidden="true">
                      {String(indice + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">{passo}</span>
                  </li>
                ))}
              </ol>
            </article>

            <article className="cc6-panel cc6-reveal p-4 sm:p-5" aria-labelledby="reativacao-titulo">
              <h2 id="reativacao-titulo" className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-corpo font-semibold tracking-tight text-[var(--atlas-texto-forte)]">
                <span className="cc6-eyebrow">Reactivation Engine</span>
                <span>Recuperar sem poluir a carteira</span>
              </h2>
              <p className="mt-1 text-corpo leading-6 text-[var(--atlas-texto-medio)]">
                A base antiga permanece isolada até elegibilidade e aprovação.
              </p>
              <div className="mt-4">
                {medido(resumo?.reactivation) === null ? (
                  <p className="cc6-warn text-rotulo font-semibold leading-none">não medido</p>
                ) : (
                  <p className="cc6-metric-value text-numero leading-none">{medido(resumo?.reactivation)}</p>
                )}
                <p className="cc6-metric-label mt-1.5">
                  Contatos governados <span className="font-mono font-normal tracking-[.12em] text-[var(--atlas-texto-fraco)]">PROTEGIDO</span>
                </p>
                <p className="mt-0.5 max-w-72 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
                  {medido(resumo?.reactivation) === null
                    ? "a fonte deste número não pôde ser lida"
                    : "Deduplicação, opt-out e telefone inválido preservados"}
                </p>
              </div>
            </article>
          </section>
        </>
      ) : null}
    </div>
  );
}
