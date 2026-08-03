"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { AtlasSkeleton } from "@/components/ui/AtlasUI";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";
import { CartasMortasPanel } from "@/components/atlas/CartasMortasPanel";

/*
 * CC-6 · Saúde operacional das integrações. Quem lê é o DIRETOR, e ele abre
 * esta tela para uma pergunta só: a operação está de pé, e se não está, o que
 * eu faço agora.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE FOI MEDIDO ANTES DE MEXER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Blocos de primeiro nível, na ordem anterior:
 *   1. PageHeader
 *   2. aviso (condicional)
 *   3. painel "Sinais vitais": cabeçalho + 8 números a 30px + rodapé de runtime
 *   4. painel "Estado por provedor": 11 linhas de 2 alturas cada
 *
 * Filetes e caixas na primeira tela: 2 bordas de painel + 2 hairlines dentro
 * do painel 1 + 10 hairlines entre linhas + 12 pílulas de estado ≈ 26 traços.
 *
 * Números sem contexto:
 *   · os 8 números do painel 1 não tinham DENOMINADOR — "Saudáveis 5" e o
 *     total (11) vivia no cabeçalho do OUTRO painel;
 *   · `text-3xl` (30px) não existe na escala do produto (10·11·13·20·34);
 *   · `IA 30d US$ {valor || 0}` e `{vital.value ?? 0}` transformavam AUSÊNCIA
 *     em zero — e zero parece saudável. É o defeito de `marketing_spend`.
 *
 * E dois campos que a ROTA JÁ PUBLICA e a tela nunca consumiu:
 *   · `summary.productionReadyCovers` — a rota passou a publicá-lo justamente
 *     para "Produção pronta" não ser lido como "tudo pronto" (a camada que
 *     GASTA verba está fora do selo). O selo continuou mudo por aqui;
 *   · `queues.oldestPendingAt` — a IDADE da fila parada, que é o prazo.
 *   · `snapshots[].queues` — 20 diagnósticos vinham no payload e só o
 *     `created_at` do primeiro era usado.
 *
 * Defeito de ordenação: a lista saía na ordem do mapa de configuração, então
 * uma integração DEGRADADA podia ser a 11ª linha. A tela que existe para dizer
 * o que quebrou enterrava o que quebrou. Ordenar (sem filtrar nada) é a
 * correção mais barata desta página.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE SUBIU, O QUE DESCEU, O QUE VIROU GRÁFICO
 * ══════════════════════════════════════════════════════════════════════════
 *
 * SOBE (decisão): o veredito em uma frase que NOMEIA quem bloqueia produção;
 * o número herói de provedores não saudáveis com denominador; fila, falhas,
 * DLQ, presos por token e "mais antiga há X"; a lista ordenada por urgência; e
 * os dois bloqueios que não têm número nenhum na tela (credencial expirada e
 * último erro), que viviam só no `title`.
 *
 * DESCE (auditoria): runtime, HTTPS, ambiente, custo de IA e último
 * diagnóstico saíram do topo e viraram o rodapé do painel da lista — mesma
 * informação, zero borda nova.
 *
 * VIRA GRÁFICO: a barra de composição responde "que fatia da operação está de
 * pé", que cinco inteiros soltos não respondem; a linha de falhas por
 * diagnóstico responde "a fila está drenando ou acumulando", que o número de
 * hoje não responde. Sem série, o painel diz SEM LASTRO — nunca inventa ponto.
 *
 * Consolidações anteriores preservadas: sinais vitais como régua mono, etapas
 * por token ✓/—, chip de produção no cabeçalho, sem <main> aninhado.
 */

type Provider = {
  provider: string;
  state: string;
  healthy: boolean;
  freshnessHours: number | null;
  pending: number;
  failed: number;
  blockers: string[];
  environmentReady: boolean;
  registered: boolean;
  verified: boolean;
};
/** O snapshot guarda o payload inteiro em jsonb; campos opcionais porque um
 *  diagnóstico antigo pode ter sido gravado antes de a chave existir. Ler com
 *  `typeof === "number"` é o que separa "não medido" de zero. */
type Snapshot = {
  id: string;
  created_at: string;
  queues?: { failed?: number | null; pending?: number | null } | null;
};
type Payload = {
  current: {
    summary: {
      healthy: number;
      degraded: number;
      readyToTest: number;
      notReady: number;
      total: number;
      productionReady: boolean;
      productionReadyCovers?: string[];
    };
    providers: Provider[];
    queues: {
      pending: number;
      failed: number;
      unresolvedDeadLetters: number;
      oldestPendingAt?: string | null;
      tokenUnhealthy?: {
        measured: boolean;
        count?: number;
        oldestAt?: string | null;
        reason?: string;
      };
    };
    runtime: {
      hostingProvider: string;
      publicHttps: boolean;
      environment: string;
      aiCostUsd30d: number;
    };
  };
  snapshots: Snapshot[];
};

const PROVIDER_NAMES: Record<string, string> = {
  meta: "Meta Lead Ads + CAPI",
  meta_marketing: "Meta Marketing API (verba)",
  whatsapp: "WhatsApp",
  google_ads: "Google Ads",
  youtube: "YouTube Ads",
  tiktok_ads: "TikTok Ads",
  openai: "OpenAI",
  perplexity: "Perplexity",
  storage: "Storage Supabase",
  hostinger: "Hostinger",
};

const nomeDoProvedor = (chave: string) =>
  PROVIDER_NAMES[chave] ?? chave.replaceAll("_", " ");

/* Estados reais do avaliador (operational-health) → chip único por linha.
 *
 * ── POR QUE ENTRA EMOJI AQUI, E SÓ AQUI ────────────────────────────────────
 *
 * Medido no navegador, tema claro, com os 11 provedores desta conta: SETE das
 * onze pastilhas saem com o MESMO trio computado —
 *   color rgb(146,64,14) · background rgba(245,181,68,.09) · borda rgba(245,181,68,.3)
 * — cobrindo TRÊS estados diferentes: "Pronta p/ teste" (×4), "Sem credenciais"
 * (×1) e "Sem cadastro" (×2). Ou seja: a pastilha não distingue nada entre
 * eles; só a PALAVRA distingue. E a palavra não ordena — ninguém lê "Sem
 * credenciais" e "Sem cadastro" e sabe qual está mais perto de operar, embora a
 * lista esteja ordenada exatamente por isso (ORDEM_DO_ESTADO).
 *
 * O emoji entra como o canal que falta: forma reconhecível de relance, que
 * sobrevive em escala de cinza e para quem não separa âmbar de rosa. E entra
 * apontando para a AÇÃO de cada estado — 🔑 é credencial no servidor, 📋 é
 * cadastro no CRM, 🧪 é o teste real que falta, 🕗 é evidência velha, 🛑 é o
 * que quebrou agora, ✅ é o que está de pé.
 *
 * `not_configured` fica SEM emoji de propósito: é o único estado que não pede
 * nada de ninguém. Marcar as onze linhas transformaria o glifo em textura —
 * se todas têm, nenhuma informa. A ausência do glifo é, ela mesma, o sinal de
 * "não há o que fazer aqui".
 *
 * O glifo é `aria-hidden`: o rótulo ao lado já diz a mesma coisa, e o leitor de
 * tela não deve ouvir "chave" antes de "sem credenciais". */
const STATE_META: Record<
  string,
  { tone: "success" | "danger" | "warning" | "neutral"; label: string; glyph: string | null }
> = {
  healthy: { tone: "success", label: "Saudável", glyph: "✅" },
  // ⛔ e não 🛑: em escala de cinza o octógono vira um disco uniforme — ou
  // seja, exatamente o "ponto colorido" que este passe existe para eliminar.
  // ⛔ mantém a barra branca no meio e continua legível sem cor nenhuma.
  degraded: { tone: "danger", label: "Degradada", glyph: "⛔" },
  stale: { tone: "warning", label: "Evidência antiga", glyph: "🕗" },
  ready_to_test: { tone: "warning", label: "Pronta p/ teste", glyph: "🧪" },
  environment_only: { tone: "warning", label: "Sem cadastro", glyph: "📋" },
  registered_only: { tone: "warning", label: "Sem credenciais", glyph: "🔑" },
  not_configured: { tone: "neutral", label: "Não configurada", glyph: null },
};

/* O glifo precisa da própria altura: a pastilha é `text-micro!` (10px) e um
   emoji a 10px vira mancha. `font-size` declarado no FILHO vence a herança do
   pai mesmo com `!important` no pai — `!` só decide disputa dentro do mesmo
   elemento. Degrau nomeado (13px = corpo), nunca meio-pixel no olho. */
function EstadoDoProvedor({ glyph, label }: { glyph: string | null; label: string }) {
  return (
    <>
      {glyph ? (
        <span aria-hidden="true" className="text-corpo leading-none">
          {glyph}
        </span>
      ) : null}
      {label}
    </>
  );
}

/* Distância até "operando". A lista é ORDENADA por isto e nada é filtrado: os
   11 provedores continuam os 11, só que o que exige decisão vem primeiro. */
const ORDEM_DO_ESTADO: Record<string, number> = {
  degraded: 0,
  stale: 1,
  ready_to_test: 2,
  registered_only: 3,
  environment_only: 4,
  not_configured: 5,
  healthy: 6,
};

const BLOCKER_LABELS: Record<string, string> = {
  environment_missing: "credenciais ausentes no servidor",
  registration_missing: "sem cadastro no CRM",
  verified_test_missing: "teste real pendente",
  sync_evidence_missing: "sem evidência de sincronização",
  sync_stale: "evidência com mais de 24h",
  failed_queue_items: "itens falhos na fila",
  token_expired: "fila parada por credencial expirada — renove o token",
  last_error_present: "último erro registrado",
};

/* Bloqueio que JÁ tem representação visível na linha (token ✓/—, "evid", ou o
   contador de falhas) não é repetido em prosa — foi por isso que a linha de
   bloqueios saiu daqui na consolidação anterior. O que sobra desta lista é o
   que não tem NENHUM número na tela: credencial expirada e último erro. Esses
   sobem para texto, porque são a AÇÃO. Chave nova cai automaticamente no lado
   visível: o padrão passa a ser mostrar, não esconder. */
const BLOQUEIO_JA_VISIVEL = new Set([
  "environment_missing",
  "registration_missing",
  "verified_test_missing",
  "sync_evidence_missing",
  "sync_stale",
  "failed_queue_items",
]);

const SNAPSHOT_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});
const DIA_CURTO = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const INTEIRO = new Intl.NumberFormat("pt-BR");
/* Máximo de 4 casas porque o custo de IA em 30 dias pode ser US$ 0,0003 — e
   arredondar para 0,00 é a mesma mentira que "sem escritores mostrando zero". */
const CUSTO = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/** Ausência não vira zero: sem número, "—". */
function inteiro(valor: number | null | undefined) {
  return typeof valor === "number" && Number.isFinite(valor) ? INTEIRO.format(valor) : "—";
}

function idadeCurta(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const horas = Math.floor(ms / 3600000);
  return horas < 48 ? `${horas}h` : `${Math.floor(horas / 24)}d`;
}

function listar(nomes: string[]) {
  if (nomes.length === 0) return "";
  if (nomes.length === 1) return nomes[0];
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

function StepToken({ label, done, hint }: { label: string; done: boolean; hint: string }) {
  return (
    <span title={hint}>
      {label} {done ? <span className="cc6-ok">✓</span> : <span aria-label="pendente">—</span>}
    </span>
  );
}

type Faixa = { chave: string; rotulo: string; estados: string[]; tinta: string; classe: string };

/* A ordem das faixas é a MESMA ordem da lista abaixo (pior → melhor): a barra
   vira o mapa da lista, não um segundo vocabulário.
 *
 * `classe` é utilitário de TOKEN com `!`, e não `cc6-crit`/`cc6-warn`/`cc6-ok`,
 * por uma razão medida: `:root[data-theme="light"] .cc6-num` e
 * `:root[data-theme="light"] .cc6-num.cc6-crit` empatam em especificidade
 * (o `:not(...)` da primeira vale por uma classe), e quem empata e vem depois
 * vence — a primeira está ~3.500 linhas abaixo. Resultado no tema claro: o
 * contador de DEGRADADAS saía âmbar, a cor de atenção, e não vermelho. Cor de
 * estado que depende de ordem de arquivo não é cor de estado. */
const FAIXAS: Faixa[] = [
  {
    chave: "degraded",
    rotulo: "degradadas",
    estados: ["degraded"],
    tinta: "var(--atlas-estado-perigo)",
    classe: "text-[var(--atlas-estado-perigo)]!",
  },
  {
    chave: "stale",
    rotulo: "evidência antiga",
    estados: ["stale"],
    tinta: "var(--atlas-estado-atencao)",
    classe: "text-[var(--atlas-estado-atencao)]!",
  },
  {
    chave: "ready_to_test",
    rotulo: "prontas p/ teste",
    estados: ["ready_to_test"],
    tinta: "var(--atlas-accent)",
    classe: "text-[var(--atlas-texto-medio)]!",
  },
  {
    chave: "pendentes",
    rotulo: "pendentes",
    estados: ["environment_only", "registered_only", "not_configured"],
    tinta: "color-mix(in srgb, var(--atlas-texto-fraco) 55%, transparent)",
    classe: "text-[var(--atlas-texto-medio)]!",
  },
  {
    chave: "healthy",
    rotulo: "saudáveis",
    estados: ["healthy"],
    tinta: "var(--atlas-estado-sucesso)",
    classe: "text-[var(--atlas-estado-sucesso)]!",
  },
];

/**
 * A pergunta: "que fatia da operação está de pé, e quanto dela exige ação?"
 * Cinco inteiros soltos dão o estoque de cada estado; só a proporção diz se o
 * problema é uma ponta ou é a maioria. SVG à mão, cor por token — canvas não
 * resolve `var()` e quebra em silêncio só em runtime.
 */
function BarraDeComposicao({
  faixas,
  total,
}: {
  faixas: Array<Faixa & { valor: number }>;
  total: number;
}) {
  const L = 100;
  const A = 6;
  const folga = 0.7;
  const visiveis = faixas.filter((f) => f.valor > 0);
  if (!total || !visiveis.length) return null;
  return (
    <svg
      viewBox={`0 0 ${L} ${A}`}
      preserveAspectRatio="none"
      className="h-2 w-full"
      role="img"
      aria-label={`Composição dos ${total} provedores monitorados: ${visiveis
        .map((f) => `${f.valor} ${f.rotulo}`)
        .join(", ")}.`}
    >
      {visiveis.map((faixa, i) => {
        const largura = (faixa.valor / total) * L;
        /* Deslocamento derivado das faixas anteriores, e não de um acumulador
           mutável: o compilador do React reclama — com razão — de variável
           reatribuída durante o render. São no máximo 6 faixas. */
        const x =
          (visiveis.slice(0, i).reduce((soma, anterior) => soma + anterior.valor, 0) / total) * L;
        return (
          <rect
            key={faixa.chave}
            x={x}
            y={0}
            width={Math.max(largura - folga, 0.8)}
            height={A}
            /* Token explícito, não `currentColor`: dentro do SVG o
               `currentColor` depende de quem for o pai naquele dia. */
            fill={faixa.tinta}
          >
            <title>{`${faixa.valor} de ${total} ${faixa.rotulo}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/**
 * A pergunta: "a fila está drenando ou acumulando?" O contador de falhas de
 * hoje não responde — 12 pode ser o resto de 40 resolvidas ou o começo de 200.
 * A série vem dos diagnósticos JÁ registrados (nada de fetch novo).
 */
function LinhaDeFalhas({ pontos }: { pontos: Array<{ at: string; valor: number }> }) {
  const L = 120;
  const A = 24;
  const pad = 2;
  const maior = Math.max(1, ...pontos.map((p) => p.valor));
  const passo = (L - pad * 2) / (pontos.length - 1);
  const x = (i: number) => pad + i * passo;
  const y = (v: number) => A - pad - (v / maior) * (A - pad * 2);
  const caminho = pontos
    .map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`)
    .join(" ");
  const primeiro = pontos[0];
  const ultimo = pontos[pontos.length - 1];
  return (
    <svg
      viewBox={`0 0 ${L} ${A}`}
      className="h-6 w-[120px] shrink-0"
      role="img"
      aria-label={`Falhas na fila nos ${pontos.length} diagnósticos registrados: de ${primeiro.valor} em ${DIA_CURTO.format(new Date(primeiro.at))} a ${ultimo.valor} em ${DIA_CURTO.format(new Date(ultimo.at))}.`}
    >
      <line
        x1={pad}
        x2={L - pad}
        y1={A - pad}
        y2={A - pad}
        stroke="color-mix(in srgb, var(--atlas-texto-fraco) 45%, transparent)"
        strokeWidth="1"
      />
      <path
        d={caminho}
        fill="none"
        stroke={
          ultimo.valor > primeiro.valor
            ? "var(--atlas-estado-perigo)"
            : "var(--atlas-estado-sucesso)"
        }
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {pontos.map((ponto, i) => (
        <rect
          key={ponto.at}
          x={x(i) - passo / 2}
          y={0}
          width={Math.max(passo, 1)}
          height={A}
          fill="transparent"
        >
          <title>{`${SNAPSHOT_FORMAT.format(new Date(ponto.at))}: ${ponto.valor} falha${ponto.valor === 1 ? "" : "s"} na fila`}</title>
        </rect>
      ))}
    </svg>
  );
}

export default function Page() {
  const [data, setData] = useState<Payload | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch("/api/v1/governance/integration-health", {
        cache: "no-store",
      }),
      j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "Indisponível");
    setData(j.data);
  }, []);
  useEffect(() => {
    load().catch((e) => setNotice(e.message));
  }, [load]);
  async function snapshot() {
    setBusy(true);
    try {
      const r = await fetch("/api/v1/governance/integration-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "snapshot" }),
      }),
        j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || "Falha");
      setNotice("Diagnóstico seguro registrado, sem armazenar segredos.");
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Falha");
    } finally {
      setBusy(false);
    }
  }
  const c = data?.current;
  const lastSnapshotAt = data?.snapshots[0]?.created_at;
  const tokenStuck = c?.queues.tokenUnhealthy;

  /* ── DECISÃO ─────────────────────────────────────────────────────────── */

  const naoSaudaveis = c ? c.summary.total - c.summary.healthy : null;
  const cobertura = c?.summary.productionReadyCovers;
  const bloqueiamProducao = c && cobertura
    ? c.providers.filter((p) => cobertura.includes(p.provider) && !p.healthy)
    : [];
  const foraDoSeloSemOperar = c && cobertura
    ? c.providers.filter((p) => !cobertura.includes(p.provider) && !p.healthy)
    : [];
  const veredito = !c
    ? "Lendo o estado das integrações…"
    : !c.summary.productionReady
      ? bloqueiamProducao.length
        ? `Produção bloqueada por ${listar(bloqueiamProducao.map((p) => nomeDoProvedor(p.provider)))}. Comece pelo topo da lista.`
        : "Produção bloqueada — a rota não publicou quais provedores o selo cobre, então o culpado tem de ser lido na lista abaixo."
      : cobertura?.length
        ? `Produção pronta: o selo cobre ${listar(cobertura.map(nomeDoProvedor))}.${
            foraDoSeloSemOperar.length
              ? ` Fora do selo, ${foraDoSeloSemOperar.length} provedor${foraDoSeloSemOperar.length === 1 ? "" : "es"} ainda não opera${foraDoSeloSemOperar.length === 1 ? "" : "m"} — a lista abaixo começa por ${foraDoSeloSemOperar.length === 1 ? "ele" : "eles"}.`
              : " Nenhum outro provedor está fora do ar."
          }`
        : "Produção pronta.";
  const acentoDoHeroi = !c
    ? ""
    : c.summary.degraded > 0
      ? "cc6-crit"
      : !c.summary.productionReady
        ? "cc6-warn"
        : naoSaudaveis === 0
          ? "cc6-ok"
          : "";

  const idadeDaFila = idadeCurta(c?.queues.oldestPendingAt);
  const incidentes: Array<{
    label: string;
    value: string;
    accent: string;
    hint: string;
    detalhe?: string;
  }> = [
    {
      label: "Fila",
      value: c ? inteiro(c.queues.pending) : "—",
      accent: "",
      hint: "Eventos pendentes ou em processamento (30d)",
      detalhe: c
        ? idadeDaFila
          ? `mais antiga há ${idadeDaFila}`
          : c.queues.pending
            ? "idade não publicada"
            : "nada parado"
        : undefined,
    },
    {
      label: "Falhas",
      value: c ? inteiro(c.queues.failed) : "—",
      accent: c?.queues.failed ? "cc6-crit" : "",
      hint: "Eventos falhos ou em dead letter (30d)",
    },
    {
      label: "DLQ",
      value: c ? inteiro(c.queues.unresolvedDeadLetters) : "—",
      accent: c?.queues.unresolvedDeadLetters ? "cc6-crit" : "",
      hint: "Dead letters sem resolução",
    },
    // Presos por credencial não aparecem em DLQ (o worker os mantém retryable
    // de propósito): sem esta coluna, o incidente de token não tem número.
    {
      label: "Token",
      value: !c ? "—" : tokenStuck?.measured ? inteiro(tokenStuck.count ?? 0) : "—",
      accent: tokenStuck?.measured && tokenStuck.count ? "cc6-crit" : "",
      hint: !tokenStuck
        ? "Fila parada por credencial expirada"
        : tokenStuck.measured
          ? `Eventos parados por credencial expirada${tokenStuck.oldestAt ? ` · mais antigo ${SNAPSHOT_FORMAT.format(new Date(tokenStuck.oldestAt))}` : ""}`
          : `Não medido — ${tokenStuck.reason ?? "leitura indisponível"}`,
      detalhe:
        c && tokenStuck && !tokenStuck.measured ? "não medido" : undefined,
    },
  ];

  const faixasMedidas = c
    ? FAIXAS.map((faixa) => ({
        ...faixa,
        valor: c.providers.filter((p) => faixa.estados.includes(p.state)).length,
      }))
    : [];
  /* Estado que o avaliador venha a criar e as faixas não conheçam apareceria
     como buraco na barra — e barra que não fecha no total é barra que mente. */
  const somaDasFaixas = faixasMedidas.reduce((s, f) => s + f.valor, 0);
  const faixasComResto =
    c && c.summary.total > somaDasFaixas
      ? [
          ...faixasMedidas,
          {
            chave: "outros",
            rotulo: "outros estados",
            estados: [],
            tinta: "color-mix(in srgb, var(--atlas-texto-fraco) 30%, transparent)",
            classe: "text-[var(--atlas-texto-medio)]!",
            valor: c.summary.total - somaDasFaixas,
          },
        ]
      : faixasMedidas;

  const provedoresOrdenados = c
    ? [...c.providers].sort(
        (a, b) => (ORDEM_DO_ESTADO[a.state] ?? 3) - (ORDEM_DO_ESTADO[b.state] ?? 3),
      )
    : [];

  /* ── AUDITORIA ───────────────────────────────────────────────────────── */

  const serieDeFalhas = (data?.snapshots ?? [])
    .filter((s) => typeof s.queues?.failed === "number")
    .map((s) => ({ at: s.created_at, valor: s.queues?.failed as number }))
    .reverse();
  const custoIa =
    c && typeof c.runtime.aiCostUsd30d === "number" && Number.isFinite(c.runtime.aiCostUsd30d)
      ? `US$ ${CUSTO.format(c.runtime.aiCostUsd30d)}`
      : "sem lastro";

  return (
    <div
      data-phase="97-integration-operational-health"
      data-health-layout="cc6-vitals"
      className="space-y-4 pb-10"
    >
      <PageHeader
        eyebrow="Integrações · Hostinger · APIs · Filas"
        title="Saúde operacional"
        description="Configurado, testado e saudável são estados diferentes — teste real obrigatório e segredos sempre mascarados."
        action={{
          href: "/integrations",
          label: "Voltar às integrações",
          priority: "secondary",
        }}
      />

      {notice ? (
        <p
          role="status"
          className="cc6-panel-quiet cc6-reveal px-4 py-3 text-sm text-[var(--atlas-texto-medio)]"
        >
          {notice}
        </p>
      ) : null}

      {/* A fila de mortos entra AQUI, e não numa tela só dela: "configurado,
          testado e saudável são estados diferentes" é exatamente a régua desta
          página, e entrega que não aconteceu é o caso mais duro dessa régua.
          Medido em 03/08/2026: 10 conversões em dead_letter esperando, com a
          ferramenta de repescagem pronta e sem nenhuma porta no produto. */}
      <CartasMortasPanel />

      <section aria-label="Sinais vitais das integrações">
        <TiltShell className="cc6-panel cc6-reveal p-5" delayMs={40}>
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="min-w-0 flex-1 basis-72">
              <p className="cc6-eyebrow">Sinais vitais</p>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <p
                  className={`cc6-metric-value text-heroi leading-none ${acentoDoHeroi}`}
                  title="Provedores monitorados que não estão saudáveis agora"
                >
                  {c ? inteiro(naoSaudaveis) : "—"}
                </p>
                <p className="text-corpo leading-5 text-[var(--atlas-texto-medio)]">
                  não saudáveis{" "}
                  {/* O `!` não é decoração: `:root[data-theme="light"] .cc6-num`
                      pinta TODO `.cc6-num` de âmbar em globals.css, e regra sem
                      camada vence utilitário em camada. Sem ele, número neutro
                      nasce com a cor de ATENÇÃO no tema claro — medido nesta
                      página: `evid 96h` (cc6-warn) e `fila 0` (neutro) saíam no
                      mesmo rgb(180,83,9), ou seja, o alerta sumia dentro do
                      texto comum. Cada `!` desta tela existe por isso. */}
                  <span className="cc6-num text-[var(--atlas-texto-fraco)]!">
                    de {c ? inteiro(c.summary.total) : "—"} monitorados
                  </span>
                </p>
              </div>
              <p className="mt-2 text-corpo leading-5 text-[var(--atlas-texto-medio)]">
                {veredito}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {c ? (
                <StatusBadge tone={c.summary.productionReady ? "success" : "warning"}>
                  {c.summary.productionReady ? "Produção pronta" : "Produção bloqueada"}
                </StatusBadge>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={snapshot}
                className="cc6-ghost-btn disabled:opacity-50"
              >
                {busy ? "Registrando…" : "Registrar diagnóstico"}
              </button>
            </div>
          </div>

          <div className="cc6-hairline mt-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 pt-4">
            <div
              className="flex flex-wrap gap-x-7 gap-y-3"
              aria-label="Filas e incidentes"
              aria-busy={!c}
            >
              {incidentes.map((item) => (
                <div key={item.label} title={item.hint}>
                  <p className={`cc6-metric-value text-numero leading-none ${item.accent}`}>
                    {item.value}
                  </p>
                  <p className="mt-1 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                    {item.label}
                  </p>
                  {item.detalhe ? (
                    <p className="cc6-num mt-0.5 text-micro leading-4 text-[var(--atlas-texto-fraco)]!">
                      {item.detalhe}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="min-w-0 flex-1 basis-64">
              {c ? (
                <>
                  <BarraDeComposicao faixas={faixasComResto} total={c.summary.total} />
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-rotulo leading-4">
                    {faixasComResto.map((faixa) => (
                      <span
                        key={faixa.chave}
                        className={`inline-flex items-center gap-1.5 ${faixa.valor ? "text-[var(--atlas-texto-medio)]" : "text-[var(--atlas-texto-fraco)]"}`}
                      >
                        <span
                          aria-hidden="true"
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: faixa.tinta }}
                        />
                        <span
                          className={`cc6-num ${faixa.valor ? faixa.classe : "text-[var(--atlas-texto-fraco)]!"}`}
                        >
                          {inteiro(faixa.valor)}
                        </span>{" "}
                        {faixa.rotulo}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <AtlasSkeleton className="h-10" />
              )}
            </div>
          </div>
        </TiltShell>
      </section>

      <section
        className="cc6-panel cc6-reveal overflow-hidden"
        style={{ animationDelay: "120ms" }}
        aria-labelledby="health-providers-title"
      >
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pt-4">
          <h2
            id="health-providers-title"
            className="text-corpo font-semibold tracking-tight text-[var(--atlas-texto-forte)]"
          >
            Estado por provedor · credencial, cadastro e teste real
          </h2>
          <p className="cc6-num text-rotulo text-[var(--atlas-texto-fraco)]!">
            {c ? `${inteiro(c.summary.total)} monitorados · o que exige ação primeiro` : "—"}
          </p>
        </header>

        <div className="mt-2" aria-busy={!c}>
          {!c ? (
            <div className="space-y-2 px-5 py-3">
              {[1, 2, 3].map((item) => (
                <AtlasSkeleton key={item} className="h-11" />
              ))}
            </div>
          ) : !provedoresOrdenados.length ? (
            <p className="px-5 py-6 text-sm text-[var(--atlas-texto-fraco)]">
              Nenhum provedor monitorado até agora.
            </p>
          ) : (
            provedoresOrdenados.map((provider, index) => {
              const state = STATE_META[provider.state] ?? {
                tone: "warning" as const,
                label: provider.state.replaceAll("_", " "),
                // Estado que o avaliador venha a criar entra sem glifo: inventar
                // um símbolo para o que a tela ainda não entende seria dar cara
                // de diagnóstico a um palpite.
                glyph: null,
              };
              const blockers = provider.blockers
                .map((blocker) => BLOCKER_LABELS[blocker] ?? blocker.replaceAll("_", " "))
                .join(" · ");
              const motivos = provider.blockers
                .filter((blocker) => !BLOQUEIO_JA_VISIVEL.has(blocker))
                .map((blocker) => BLOCKER_LABELS[blocker] ?? blocker.replaceAll("_", " "));
              const degraded = provider.state === "degraded";
              return (
                <article
                  key={provider.provider}
                  title={blockers || undefined}
                  className={`cc6-reveal flex min-h-11 flex-wrap items-center gap-x-5 gap-y-1 px-5 py-2.5 transition-colors hover:bg-[color-mix(in_srgb,var(--atlas-accent)_6%,transparent)] ${index ? "cc6-hairline" : ""} ${degraded ? "cc6-sev-band" : ""}`}
                  style={
                    {
                      animationDelay: `${Math.min(index + 1, 12) * 35}ms`,
                      /* Token, não hex: o filete de severidade é ESTADO, e
                         estado que não vira com o tema é estado que some. */
                      ...(degraded ? { "--cc6-sev": "var(--atlas-estado-perigo)" } : null),
                    } as CSSProperties
                  }
                >
                  <p className="min-w-0 flex-1 basis-56 text-corpo font-medium leading-5 text-[var(--atlas-texto-forte)]">
                    {nomeDoProvedor(provider.provider)}
                  </p>
                  <p className="cc6-num shrink-0 text-micro tracking-wide text-[var(--atlas-texto-fraco)]!">
                    <StepToken
                      label="ambiente"
                      done={provider.environmentReady}
                      hint={
                        provider.environmentReady
                          ? "Credenciais detectadas no servidor"
                          : "Credenciais pendentes no servidor"
                      }
                    />
                    {" · "}
                    <StepToken
                      label="cadastro"
                      done={provider.registered}
                      hint={
                        provider.registered
                          ? "Cadastro presente no CRM"
                          : "Cadastro pendente no CRM"
                      }
                    />
                    {" · "}
                    <StepToken
                      label="teste"
                      done={provider.verified}
                      hint={
                        provider.verified ? "Teste real comprovado" : "Teste real pendente"
                      }
                    />
                  </p>
                  <p className="cc6-num shrink-0 text-rotulo text-[var(--atlas-texto-medio)]!">
                    <span
                      title="Idade da última evidência de sincronização"
                      className={
                        provider.freshnessHours == null
                          ? "text-[var(--atlas-texto-fraco)]"
                          : provider.freshnessHours > 24
                            ? "cc6-warn"
                            : ""
                      }
                    >
                      evid{" "}
                      {provider.freshnessHours == null ? "—" : `${provider.freshnessHours}h`}
                    </span>
                    {" · "}
                    <span title="Eventos pendentes na fila deste provedor">
                      fila {provider.pending}
                    </span>
                    {" · "}
                    <span
                      className={provider.failed ? "cc6-crit" : ""}
                      title={
                        provider.failed
                          ? `Falhas na fila deste provedor — ${blockers || "ver diagnóstico"}`
                          : "Sem falhas na fila"
                      }
                    >
                      falhas {provider.failed}
                    </span>
                  </p>
                  <StatusBadge tone={state.tone}>
                    <EstadoDoProvedor glyph={state.glyph} label={state.label} />
                  </StatusBadge>
                  {motivos.length ? (
                    <p
                      className={`basis-full text-rotulo leading-4 ${degraded ? "cc6-crit" : "cc6-warn"}`}
                    >
                      {/* Separador, não conjunção: "renove o token e último erro
                          registrado" vira uma frase só e some; " · " mantém os
                          bloqueios como itens contáveis. */}
                      {motivos.join(" · ")}
                    </p>
                  ) : null}
                </article>
              );
            })
          )}
        </div>

        {/* AUDITORIA — desce para o rodapé da lista, sem borda nova: o runtime
            não decide nada, mas some se for apagado, e nada aqui é apagado. */}
        <footer className="cc6-hairline mt-1 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 pb-4 pt-3">
          <p className="cc6-num min-w-0 text-rotulo leading-5 text-[var(--atlas-texto-fraco)]!">
            {c ? (
              <>
                {c.runtime.hostingProvider} · HTTPS{" "}
                <span className={c.runtime.publicHttps ? "cc6-ok" : "cc6-warn"}>
                  {c.runtime.publicHttps ? "válido" : "pendente"}
                </span>
                {" · "}
                {c.runtime.environment} ·{" "}
                <span title="Soma de estimated_cost_usd dos eventos de uso de IA nos últimos 30 dias; zero significa nenhum evento registrado, não tarifa medida.">
                  IA 30d {custoIa}
                </span>{" "}
                · segredos mascarados
                {lastSnapshotAt
                  ? ` · último diagnóstico ${SNAPSHOT_FORMAT.format(new Date(lastSnapshotAt))}`
                  : " · nenhum diagnóstico registrado"}
              </>
            ) : (
              "Aguardando leitura do runtime…"
            )}
          </p>
          {serieDeFalhas.length >= 2 ? (
            <figure className="m-0 flex shrink-0 items-center gap-2">
              <LinhaDeFalhas pontos={serieDeFalhas} />
              <figcaption className="text-micro leading-4 text-[var(--atlas-texto-fraco)]">
                falhas na fila
                <br />
                <span className="cc6-num text-[var(--atlas-texto-fraco)]!">
                  {serieDeFalhas.length} diagnósticos
                </span>
              </figcaption>
            </figure>
          ) : (
            <p className="text-micro leading-4 text-[var(--atlas-texto-fraco)]">
              Série de falhas sem lastro:{" "}
              {serieDeFalhas.length === 1
                ? "há um diagnóstico registrado"
                : "nenhum diagnóstico registrado"}{" "}
              — são precisos dois para dizer se a fila drena ou acumula.
            </p>
          )}
        </footer>
      </section>
    </div>
  );
}
