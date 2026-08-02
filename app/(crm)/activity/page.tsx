"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { alvoDaIntencao, lerIntencaoDaJanela } from "@/lib/atlas/intencao-da-url";
import {
  activityCategoryLabels,
  type ActivityCategory,
} from "@/lib/atlas/activity-timeline";
import { AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";

/*
 * CC-6 · Atividade — o histórico que o GESTOR audita.
 *
 * ── A MEDIÇÃO QUE MOTIVOU ESTA PASSADA (2026-08-02) ─────────────────────────
 *
 * Blocos de primeiro nível, na ordem anterior:
 *   1. PageHeader
 *   2. erro recuperável (condicional)
 *   3. "Pulso do histórico" — 3 números + selo ao vivo + Atualizar
 *   4. "Linha do tempo" — cabeçalho, busca, 4 chips de período, 7 de categoria,
 *      grupos por dia, rodapé de governança
 *
 * Filetes/bordas/caixas contados num recorte típico (7 dias · 6 dias com
 * evento · 40 registros):
 *   2 painéis · 1 hairline do pulso · 1 borda de busca · 11 chips de filtro ·
 *   6 hairlines de cabeçalho de dia · 34 hairlines de linha ·
 *   **40 chips com borda, um por linha** · 1 rodapé  ≈ 95 filetes.
 * O próprio globals.css já catalogou a doença: quando tudo tem filete, ele não
 * quer dizer nada — vira textura. Os 40 chips de categoria eram o maior foco.
 *
 * Números que apareciam sem contexto:
 *   · "Registros hoje" — 12 comparado a quê? sem base nenhuma.
 *   · "Clientes com movimentação" — de quantos? não dizia.
 *   · "Registros no escopo" — é o MESMO número do chip "Tudo", a 300px dele.
 *   · os 7 contadores de chip contavam o histórico INTEIRO da resposta e não
 *     mudavam com o período: com "Hoje" marcado, o chip dizia 88 enquanto a
 *     lista mostrava 3. Isso não é falta de contexto, é contexto ERRADO.
 *   · três números a `text-3xl` (30px) — fora da escala (20 · 34), e três
 *     "heróis" significa nenhum.
 *
 * ── O QUE MUDOU, PELA RÉGUA (decisão > informação > auditoria) ──────────────
 *
 * SOBE: "Exige decisão" — proposta sem desfecho, cliente que passou de mão e
 * parou, e silêncio de 7+ dias. Tudo derivado dos MESMOS eventos que já
 * chegavam (último evento por cliente), zero fetch novo, zero número inventado.
 * DESCE: "Pulso do histórico" — telemetria, por definição auditoria. Desce e
 * ganha o gráfico de ritmo, que dá aos três números o contexto que faltava.
 *
 * ── POR QUE A DERIVAÇÃO É EXATA, E ONDE ELA CALA ────────────────────────────
 *
 * A API devolve os 500 registros MAIS RECENTES em ordem decrescente, ou seja um
 * PREFIXO da ordem global. Logo, para todo cliente presente na janela, o evento
 * mais recente dele está na janela — "parado há N dias" é exato para quem
 * aparece. Sobre quem NÃO aparece nada é afirmado, e o rodapé diz o limite.
 *
 * O gráfico de ritmo aplica a mesma disciplina: o dia mais antigo da janela é
 * PARCIAL (foi cortado no meio pelo limite de 500), então ele e tudo antes dele
 * ficam de fora — barra zero ali seria "não medi" desenhado como "não houve".
 *
 * ── SEGUNDA MEDIÇÃO, DEPOIS QUE A ORDEM JÁ ESTAVA CERTA ────────────────────
 *
 * A hierarquia acima (decisão · informação · auditoria) sobreviveu à
 * remedição: nada precisou subir nem descer. O que a segunda passada achou
 * foram dois defeitos que a REORDENAÇÃO não toca, porque não são de posição.
 *
 * 1. O ZERO QUE SÓ APARECE QUANDO O PAINEL ESTÁ CEGO.
 *    `loading ? "—" : data?.summary.today ?? 0` — o `??` nunca dispara
 *    enquanto o fetch funciona. Dispara exatamente quando ele FALHA:
 *    `loading` volta a false, `data` continua null, e o pulso anuncia três
 *    zeros. Um gestor auditando lê "dia parado", não "não consegui medir".
 *    Detalhe do caso: o erro recuperável aparece no topo da página, longe —
 *    e um número redondo não parece defeito, então ele vence a tarja.
 *    Corrigido para "—" + a frase do que falta, que é como os outros dois
 *    painéis desta mesma tela já se comportavam.
 *
 * 2. CINCO DEGRAUS FORA DA ESCALA, num arquivo que já tinha 24 dentro dela.
 *    `text-base` (16) no título · `text-sm` (14) na busca, no título do
 *    evento e no vazio · `text-xs` (12) no "Lead 360" · e `cc6-metric-label`
 *    a 11,5px, que é literalmente o meio pixel que o comentário da escala em
 *    globals.css cita como sintoma. A superfície de referência da sala de
 *    comando tem ZERO ocorrências de `text-sm|base|xs` em 1.149 linhas — a
 *    escala não é sugestão, é o padrão vivo. Agora esta página também tem 0.
 *
 * Efeito colateral bom do item 2: os três painéis irmãos passaram a abrir com
 * o MESMO título de 11px. Antes o do meio tinha peso próprio, o que fazia o
 * olho procurar uma hierarquia entre eles que não existe — a hierarquia desta
 * tela é a ordem vertical, e só ela.
 *
 * O que NÃO mudou, de propósito: nenhum painel, botão, texto ou fetch saiu;
 * nenhuma cor nova; nenhum gráfico novo (o de ritmo já responde a pergunta que
 * o número sozinho não responde, que é onde ficou o dia sem registro nenhum).
 *
 * ── CONSOLIDAÇÕES ANTERIORES (mantidas) ────────────────────────────────────
 * - o card "Contexto recente" duplicava os 3 primeiros eventos da timeline;
 * - o details "composição do histórico" repetia os contadores dos chips;
 * - "Contatos" no resumo era o mesmo número do chip Contatos;
 * - hora aparece uma única vez por linha.
 */

type ActivityEvent = {
  id: string;
  category: ActivityCategory;
  title: string;
  description: string | null;
  occurredAt: string;
  source: string;
  leadId: string | null;
  leadName: string | null;
  leadStatus: string | null;
  actorName: string;
};

type ActivityData = {
  summary: {
    total: number;
    today: number;
    contacts: number;
    leadsInMotion: number;
  };
  counts: Record<ActivityCategory, number>;
  events: ActivityEvent[];
  generatedAt: string;
};

type Period = "today" | "week" | "month" | "all";
type CategoryFilter = "all" | ActivityCategory;
type BaldeKey = "proposta" | "fila" | "silencio";
type Parada = ActivityEvent & { dias: number; balde: BaldeKey };

const PERIODS = [
  ["today", "Hoje"],
  ["week", "7 dias"],
  ["month", "30 dias"],
  ["all", "Completo"],
] as const satisfies ReadonlyArray<readonly [Period, string]>;

const CATEGORIES = [
  ["all", "Tudo"],
  ["contact", "Contatos"],
  ["change", "Movimentações"],
  ["proposal", "Propostas"],
  ["transfer", "Transferências"],
  ["ai", "Inteligência"],
  ["external", "Integrações"],
] as const satisfies ReadonlyArray<readonly [CategoryFilter, string]>;

/**
 * OS TRÊS MOTIVOS DE PARADA, E POR QUE O LIMITE FICA VISÍVEL NA TELA.
 *
 * O prazo (3 · 2 · 7 dias) é regra editorial, não dado medido — então ele é
 * ESCRITO no rótulo que o gestor lê. Limite escondido é a diferença entre "o
 * Atlas diz que está parado" e "o Atlas conta assim, e eu concordo".
 *
 * A ordem importa: um cliente cai em UM balde só, o primeiro que casar. Sem
 * isso, uma proposta de 30 dias contaria duas vezes e o total mentiria para
 * cima — o defeito mais fácil de cometer num painel de fila.
 *
 * ── POR QUE `ink` NÃO USA `.cc6-crit` / `.cc6-warn` ────────────────────────
 * MEDIDO no navegador, tema claro, com a folha real: os dois saem IDÊNTICOS,
 * rgb(180,83,9). A causa é um empate de especificidade —
 * `:root[data-theme=light] .cc6-num.cc6-crit` e
 * `:root[data-theme=light] .cc6-num:not(...)` valem (0,4,0) as duas, e a
 * segunda vem depois no arquivo, então ela vence. Resultado: dois níveis de
 * gravidade com uma cor só, justamente no tema em que o dono trabalha.
 *
 * Apontar direto para o token de estado, com `!` para passar por cima da regra
 * sem camada, devolve os dois níveis nos DOIS temas. A faixa lateral já
 * separava (rose x marrom); agora o número acompanha em vez de contradizer.
 */
const BALDES = [
  {
    key: "proposta",
    dias: 3,
    rotulo: "Proposta sem desfecho",
    detalhe: "última coisa registrada foi uma proposta, há 3 dias ou mais",
    tom: "var(--atlas-estado-perigo)",
    ink: "text-[var(--atlas-estado-perigo)]!",
  },
  {
    key: "fila",
    dias: 2,
    rotulo: "Passou de mão e parou",
    detalhe: "última coisa registrada foi uma transferência, há 2 dias ou mais",
    tom: "var(--atlas-estado-atencao)",
    ink: "text-[var(--atlas-estado-atencao)]!",
  },
  {
    key: "silencio",
    dias: 7,
    rotulo: "Sem registro há 7 dias ou mais",
    detalhe: "nenhuma atividade de qualquer tipo desde então",
    tom: "var(--atlas-estado-atencao)",
    ink: "text-[var(--atlas-estado-atencao)]!",
  },
] as const satisfies ReadonlyArray<{
  key: BaldeKey;
  dias: number;
  rotulo: string;
  detalhe: string;
  tom: string;
  ink: string;
}>;

const BALDE_POR_KEY = {
  proposta: BALDES[0],
  fila: BALDES[1],
  silencio: BALDES[2],
} as const;

// Quantas paradas o painel mostra antes de recolher o resto.
//
// O excedente vai para um <details> NATIVO, e a escolha é deliberada em duas
// frentes. A primeira é de produto: "12 parados" com 4 visíveis e nenhum
// caminho para os outros 8 é beco sem saída — o número acusa e a tela não
// deixa agir. A segunda é de contrato: o portão da fase 040 fixa a contagem de
// ganchos de estado desta página, e o elemento nativo recolhe sem gastar
// nenhum. Menos estado para o mesmo recurso é o negócio certo dos dois lados.
const PARADAS_VISIVEIS = 4;
const DIA_MS = 86_400_000;
const RITMO_DIAS = 14;

const TZ = "America/Sao_Paulo";
const DAY_KEY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const DAY_HEADING_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  weekday: "short",
  day: "2-digit",
  month: "short",
});
const DAY_SHORT_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
});
const TIME_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
});
const FULL_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  dateStyle: "short",
  timeStyle: "short",
});

const dayKey = (value: string) => DAY_KEY_FORMAT.format(new Date(value));
const timeLabel = (value: string) => TIME_FORMAT.format(new Date(value));
const fullLabel = (value: string) => FULL_FORMAT.format(new Date(value));
const dayShort = (value: string) => DAY_SHORT_FORMAT.format(new Date(value));

// Cabeçalho mono do dia: HOJE, ONTEM ou "SEX · 18 JUL" (ano só quando difere).
function dayHeading(value: string, nowMs: number) {
  const key = dayKey(value);
  if (nowMs) {
    if (key === dayKey(new Date(nowMs).toISOString())) return "Hoje";
    if (key === dayKey(new Date(nowMs - DIA_MS).toISOString())) {
      return "Ontem";
    }
  }
  const compact = DAY_HEADING_FORMAT.format(new Date(value))
    .replaceAll(".", "")
    .replace(", ", " · ")
    .replace(" de ", " ");
  const year = key.slice(0, 4);
  const currentYear = nowMs
    ? dayKey(new Date(nowMs).toISOString()).slice(0, 4)
    : year;
  return year === currentYear ? compact : `${compact} ${year}`;
}

// Relativo só dentro de HOJE; o absoluto completo fica no title da linha.
function relativeTime(value: string, nowMs: number) {
  const diff = Math.max(0, nowMs - new Date(value).getTime());
  if (diff < 60_000) return "agora";
  if (diff < 3_600_000) return `há ${Math.floor(diff / 60_000)}min`;
  return `há ${Math.floor(diff / 3_600_000)}h`;
}

const diasLabel = (dias: number) =>
  dias <= 0 ? "hoje" : dias === 1 ? "há 1 dia" : `há ${dias} dias`;

const normalize = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const chipClass = (active: boolean) =>
  `cc6-chip cursor-pointer transition-colors ${
    active
      ? "border-[color:var(--atlas-accent)]! text-[var(--atlas-texto-forte)]!"
      : "hover:border-[rgba(148,163,184,0.35)]! hover:text-[var(--atlas-texto-forte)]!"
  }`;

export default function ActivityPage() {
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<Period>("week");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");
  const [live, setLive] = useState("connecting");
  const [nowMs, setNowMs] = useState(0);

  /**
   * A INTENÇÃO QUE VEIO NO LINK.
   *
   * O contrato desta página (lib/atlas/core-v2/page-registry.ts) promete
   * "Ver atividade recente" → /activity?view=today. Até 2026-07-29 a promessa
   * era decorativa em dois níveis: a chave era `period`, fora do vocabulário
   * fechado, e a tela não lia parâmetro nenhum — abria sempre em "7 dias" e
   * mostrava um conjunto de eventos diferente do prometido.
   *
   * O valor é conferido contra PERIODS, a MESMA lista que desenha os chips:
   * valor inventado na barra de endereço não pode virar recorte silencioso,
   * porque uma linha do tempo vazia se lê como "não aconteceu nada" — e aqui
   * isso é pior que em qualquer lista, já que a página existe justamente para
   * provar que algo aconteceu.
   *
   * Roda uma vez na montagem: a URL define o estado inicial, e os chips assumem
   * a partir daí. `filtersDirty` já compara com "week", então o recorte vindo
   * do link aparece marcado — filtro invisível é a diferença entre "a lista
   * está filtrada" e "o histórico sumiu".
   */
  useEffect(() => {
    const alvo = alvoDaIntencao(lerIntencaoDaJanela(), "visao");
    const escolhido = PERIODS.find(([chave]) => chave === alvo);
    if (escolhido) setPeriod(escolhido[0]);
  }, []);

  // Relógio de 1min: mantém "há 2h"/HOJE frescos sem tocar nos fetches.
  useEffect(() => {
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const sessionToken = useCallback(async () => {
    const session = await supabase.auth.getSession();
    return session.data.session?.access_token || "";
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch("/api/v1/activity", {
        headers: { Authorization: `Bearer ${await sessionToken()}` },
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error();
      setData(body.data || body);
      setError("");
    } catch {
      setError("Não foi possível atualizar o histórico comercial.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("commercial-activity-history")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "activities" },
        () => void load(true),
      );
    channel.subscribe((status) =>
      setLive(
        status === "SUBSCRIBED"
          ? "connected"
          : status === "CHANNEL_ERROR" || status === "TIMED_OUT"
            ? "degraded"
            : "connecting",
      ),
    );
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  /**
   * O recorte de PERÍODO e BUSCA, sozinho — sem a categoria.
   *
   * Ele é usado em dois lugares e essa é a correção: a lista aplica período +
   * busca + categoria; os contadores dos chips aplicam período + busca e
   * deixam a categoria de fora, para que cada chip responda "quanto eu veria SE
   * clicasse aqui". Antes o contador vinha de `data.counts`, que é o histórico
   * inteiro: com "Hoje" marcado, o chip anunciava um número que a lista logo
   * abaixo contradizia.
   */
  const filtroBase = useMemo(() => {
    const today = new Date(data?.generatedAt || 0);
    const now = today.getTime();
    const todayStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    ).getTime();
    const normalizedQuery = normalize(query.trim());
    return (event: ActivityEvent) => {
      const at = new Date(event.occurredAt).getTime();
      if (period === "today" && at < todayStart) return false;
      if (period === "week" && at < now - 7 * DIA_MS) return false;
      if (period === "month" && at < now - 30 * DIA_MS) return false;
      if (!normalizedQuery) return true;
      return normalize(
        [
          event.title,
          event.description,
          event.leadName,
          event.actorName,
          activityCategoryLabels[event.category],
        ].join(" "),
      ).includes(normalizedQuery);
    };
  }, [data?.generatedAt, period, query]);

  const visible = useMemo(
    () =>
      (data?.events ?? []).filter(
        (event) =>
          filtroBase(event) &&
          (category === "all" || event.category === category),
      ),
    [category, data, filtroBase],
  );

  const escopo = useMemo(() => {
    const totais: Record<CategoryFilter, number> = {
      all: 0,
      change: 0,
      contact: 0,
      transfer: 0,
      ai: 0,
      proposal: 0,
      external: 0,
    };
    for (const event of data?.events ?? []) {
      if (!filtroBase(event)) continue;
      totais.all += 1;
      totais[event.category] += 1;
    }
    return totais;
  }, [data, filtroBase]);

  /**
   * O QUE EXIGE DECISÃO — derivado, nunca inventado.
   *
   * Um passo só: o evento MAIS RECENTE de cada cliente. A comparação é por
   * timestamp e não pela posição na lista, de propósito — depender da ordem que
   * a API mandou é a classe de defeito que já custou caro aqui (um `order` que
   * muda no servidor viraria um painel errado no cliente, em silêncio).
   */
  const paradas = useMemo(() => {
    const eventos = data?.events ?? [];
    const ancora = new Date(data?.generatedAt || 0).getTime();
    if (!eventos.length || !Number.isFinite(ancora) || !ancora) return null;

    const ultimoPorCliente = new Map<string, ActivityEvent>();
    for (const event of eventos) {
      if (!event.leadId) continue;
      const at = new Date(event.occurredAt).getTime();
      if (!Number.isFinite(at)) continue;
      const atual = ultimoPorCliente.get(event.leadId);
      if (!atual || at > new Date(atual.occurredAt).getTime()) {
        ultimoPorCliente.set(event.leadId, event);
      }
    }

    const itens: Parada[] = [];
    const contagem: Record<BaldeKey, number> = {
      proposta: 0,
      fila: 0,
      silencio: 0,
    };
    for (const event of ultimoPorCliente.values()) {
      const dias = Math.floor(
        (ancora - new Date(event.occurredAt).getTime()) / DIA_MS,
      );
      const balde =
        event.category === "proposal" && dias >= BALDE_POR_KEY.proposta.dias
          ? "proposta"
          : event.category === "transfer" && dias >= BALDE_POR_KEY.fila.dias
            ? "fila"
            : dias >= BALDE_POR_KEY.silencio.dias
              ? "silencio"
              : null;
      if (!balde) continue;
      contagem[balde] += 1;
      itens.push({ ...event, dias, balde });
    }
    const peso: Record<BaldeKey, number> = { proposta: 0, fila: 1, silencio: 2 };
    itens.sort((a, b) => peso[a.balde] - peso[b.balde] || b.dias - a.dias);
    return { clientes: ultimoPorCliente.size, itens, contagem };
  }, [data]);

  /**
   * RITMO — a pergunta que o número sozinho não responde.
   *
   * "Registros hoje: 12" não diz se 12 é bom. A série de 14 dias diz, e mostra
   * o que nenhum total mostra: o DIA EM QUE NINGUÉM REGISTROU NADA. Para um
   * gestor que audita, o buraco é o achado.
   *
   * O dia mais antigo da janela sai fora porque foi cortado ao meio pelo limite
   * de 500 — desenhá-lo seria transformar "não medi" em "não houve".
   */
  const ritmo = useMemo(() => {
    const eventos = data?.events ?? [];
    const ancora = new Date(data?.generatedAt || 0).getTime();
    if (!eventos.length || !Number.isFinite(ancora) || !ancora) return null;

    const porDia = new Map<string, number>();
    let maisAntigo = Number.POSITIVE_INFINITY;
    for (const event of eventos) {
      const at = new Date(event.occurredAt).getTime();
      if (!Number.isFinite(at)) continue;
      if (at < maisAntigo) maisAntigo = at;
      const chave = dayKey(event.occurredAt);
      porDia.set(chave, (porDia.get(chave) ?? 0) + 1);
    }
    if (!Number.isFinite(maisAntigo)) return null;

    const diaParcial = dayKey(new Date(maisAntigo).toISOString());
    const dias: { chave: string; total: number; iso: string }[] = [];
    for (let recuo = RITMO_DIAS - 1; recuo >= 0; recuo -= 1) {
      const iso = new Date(ancora - recuo * DIA_MS).toISOString();
      const chave = dayKey(iso);
      if (chave <= diaParcial) continue;
      dias.push({ chave, total: porDia.get(chave) ?? 0, iso });
    }
    if (!dias.length) return null;

    const pico = dias.reduce((maior, dia) =>
      dia.total > maior.total ? dia : maior,
    );
    const vazios = dias.filter((dia) => dia.total === 0).length;
    return { dias, max: Math.max(pico.total, 1), pico, vazios };
  }, [data]);

  // Grupos por dia (fuso SP) com offset acumulado para a revelação escalonada.
  const timelineGroups = useMemo(() => {
    const byDay = visible.reduce<Record<string, ActivityEvent[]>>(
      (result, event) => {
        (result[dayKey(event.occurredAt)] ??= []).push(event);
        return result;
      },
      {},
    );
    let offset = 0;
    return Object.entries(byDay).map(([key, items]) => {
      const group = { key, items, offset };
      offset += items.length + 1;
      return group;
    });
  }, [visible]);

  const categoryCount = (key: CategoryFilter) => escopo[key];
  // Não é "o histórico completo": é a JANELA de até 500 registros que a API
  // devolveu, e o rodapé desta mesma tela já diz isso. Chamar a janela de
  // completo é a mesma família da Lei A — afirmar mais do que se mediu.
  const naJanela = (key: CategoryFilter) =>
    key === "all" ? data?.summary.total ?? 0 : data?.counts[key] ?? 0;
  const todayKey = nowMs ? dayKey(new Date(nowMs).toISOString()) : "";
  const filtersDirty = Boolean(query) || category !== "all" || period !== "week";

  /**
   * OS TRÊS NÚMEROS DA AUDITORIA — e por que nenhum deles pode cair para zero.
   *
   * `loading ? "—" : data?.summary.today ?? 0` parecia inofensivo, e é
   * justamente por isso que passou: enquanto o fetch funciona, o `??` NUNCA
   * dispara. Ele dispara exatamente no caso que interessa — o fetch falhou,
   * `loading` já voltou a false, `data` continua null — e aí a tela anuncia
   * "0 registros hoje · 0 clientes com movimentação · 0 registros no escopo".
   *
   * Três zeros se leem como um dia parado, não como um painel cego. O gestor
   * que audita tira a conclusão OPOSTA à verdade, e o pior é que ele a tira
   * com confiança, porque número redondo não parece defeito. É o precedente do
   * `usageCost`, que devolve NULO e não zero quando não há tarifa: zero parece
   * saudável, nulo diz a verdade.
   *
   * A ausência agora vira "—" e ganha, logo abaixo, a frase do que falta. O
   * painel de decisão já falava "sem lastro" nessa situação; o pulso era o
   * único dos três que ainda respondia com um número inventado.
   */
  const pulso = [
    ["Registros hoje", data?.summary.today],
    ["Clientes com movimentação", data?.summary.leadsInMotion],
    ["Registros no escopo", data?.summary.total],
  ] as const satisfies ReadonlyArray<readonly [string, number | undefined]>;

  const linhaDeParada = (item: Parada) => {
    const balde = BALDE_POR_KEY[item.balde];
    const corpo = (
      <>
        <span className="min-w-0 flex-1">
          <span className="block text-corpo font-medium leading-5 text-[var(--atlas-texto-forte)]">
            {item.leadName || "Cliente sem nome"}
          </span>
          <span className="mt-0.5 block text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
            {balde.rotulo} · {item.actorName}
          </span>
        </span>
        <span
          className={`cc6-num shrink-0 self-center text-rotulo ${balde.ink}`}
        >
          {diasLabel(item.dias)}
        </span>
      </>
    );
    const classe =
      "cc6-sev-band flex min-h-11 items-center gap-3 py-2 pl-3 pr-1 transition-colors hover:bg-[color-mix(in_srgb,var(--atlas-accent)_7%,transparent)]";
    const estilo = { "--cc6-sev": balde.tom } as CSSProperties;
    return (
      <li key={item.id}>
        {item.leadId ? (
          <Link
            href={`/leads/${item.leadId}`}
            className={classe}
            style={estilo}
            title={`${balde.rotulo} — ${balde.detalhe}. Último registro: ${item.title}, em ${fullLabel(item.occurredAt)}.`}
          >
            {corpo}
          </Link>
        ) : (
          <span className={classe} style={estilo}>
            {corpo}
          </span>
        )}
      </li>
    );
  };

  return (
    <div
      className="space-y-4 pb-10"
      data-evolution-phase="40"
      data-activity-layout="cc6-reading-timeline"
    >
      <PageHeader
        eyebrow="CRM · Atividade"
        title="O histórico que explica a operação"
        description="Contatos, movimentações, propostas e decisões em ordem cronológica — o contexto antes de agir."
        action={{
          href: "/leads",
          label: "Abrir carteira",
          priority: "secondary",
        }}
      />

      {error ? (
        <AtlasRecoverableError
          description={error}
          onRetry={() => void load()}
          busy={loading}
        />
      ) : null}

      {/* ── DECISÃO ──────────────────────────────────────────────────────────
          Primeiro painel porque é o único que pede ação. O selo "ao vivo" e o
          botão Atualizar moram aqui, e não no rodapé com a telemetria, porque
          a pergunta "isto está fresco?" vem ANTES de confiar na fila. */}
      <section
        className="cc6-panel cc6-reveal overflow-hidden"
        aria-labelledby="activity-decisao-title"
      >
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pt-4">
          <p className="cc6-eyebrow" id="activity-decisao-title">
            Exige decisão
          </p>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <StatusBadge
              tone={
                live === "connected"
                  ? "success"
                  : live === "degraded"
                    ? "warning"
                    : "neutral"
              }
            >
              {live === "connected"
                ? "Ao vivo"
                : live === "degraded"
                  ? "Atualização manual"
                  : "Conectando"}
            </StatusBadge>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="cc6-ghost-btn disabled:opacity-50"
            >
              {loading ? "Atualizando…" : "Atualizar"}
            </button>
          </div>
        </header>

        <div className="px-5 pb-4 pt-3" aria-busy={loading}>
          {loading ? (
            <AtlasSkeleton className="h-20" />
          ) : !paradas ? (
            <p className="text-corpo leading-5 text-[var(--atlas-texto-medio)]">
              <strong className="cc6-warn font-semibold">Sem lastro.</strong>{" "}
              Nenhum registro carregado para esta organização — sem evento não há
              como dizer o que parou.
            </p>
          ) : paradas.clientes === 0 ? (
            <p className="text-corpo leading-5 text-[var(--atlas-texto-medio)]">
              <strong className="cc6-warn font-semibold">Sem lastro.</strong>{" "}
              Nenhum dos {data?.summary.total ?? 0} registros carregados traz
              cliente vinculado — falta o vínculo com o lead para medir parada.
            </p>
          ) : paradas.itens.length === 0 ? (
            <p className="text-corpo leading-5 text-[var(--atlas-texto-medio)]">
              <strong className="cc6-ok font-semibold">Nada parado.</strong> Os{" "}
              {paradas.clientes} clientes com registro tiveram movimento dentro
              dos prazos abaixo.
            </p>
          ) : (
            <div className="flex flex-col gap-x-8 gap-y-4 lg:flex-row">
              <div className="flex shrink-0 flex-wrap items-end gap-x-8 gap-y-3 lg:w-[26rem] lg:flex-col lg:items-stretch">
                <div>
                  {/* O `!` na cor NÃO é preferência de estilo, é necessidade
                      medida: `:root[data-theme="light"] .cc6-num` pinta TODO
                      `.cc6-num` de âmbar, sem camada — e CSS fora de
                      camada vence utilitário do Tailwind, por mais específico
                      que ele seja. Sem o `!`, este número sai laranja no tema
                      claro, que aqui é cor de ESTADO: o total viraria um alerta
                      permanente. Cor é informação neste produto; o número que
                      resume a fila precisa ser tinta neutra. */}
                  <p className="cc6-num text-heroi font-semibold leading-none tracking-tight text-[var(--atlas-texto-forte)]!">
                    {paradas.itens.length}
                  </p>
                  <p className="mt-1 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                    de {paradas.clientes} clientes com registro estão parados
                  </p>
                </div>
                <ul className="flex flex-wrap gap-x-6 gap-y-2 lg:w-full lg:flex-col lg:gap-y-1.5">
                  {BALDES.map((balde) => (
                    <li
                      key={balde.key}
                      className="flex items-baseline gap-2 lg:justify-between"
                      title={balde.detalhe}
                    >
                      <span className="text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                        {balde.rotulo}
                      </span>
                      {/* Balde ZERADO precisa de tinta apagada, e por isso o
                          `!`: sem ele o `.cc6-num` do tema claro pintaria o
                          zero de âmbar — "0 propostas paradas" com cara de
                          alerta é o oposto do que o número diz. */}
                      <span
                        className={`cc6-num text-numero font-semibold leading-none ${
                          paradas.contagem[balde.key]
                            ? balde.ink
                            : "text-[var(--atlas-texto-fraco)]!"
                        }`}
                      >
                        {paradas.contagem[balde.key]}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="min-w-0 flex-1">
                <ul>{paradas.itens.slice(0, PARADAS_VISIVEIS).map(linhaDeParada)}</ul>
                {paradas.itens.length > PARADAS_VISIVEIS ? (
                  <details className="mt-1">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center text-rotulo font-medium text-[color:var(--atlas-accent)] hover:underline">
                      Ver os {paradas.itens.length - PARADAS_VISIVEIS} restantes
                    </summary>
                    <ul>
                      {paradas.itens.slice(PARADAS_VISIVEIS).map(linhaDeParada)}
                    </ul>
                  </details>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── INFORMAÇÃO ─────────────────────────────────────────────────────── */}
      <section
        className="cc6-panel cc6-reveal overflow-hidden"
        style={{ animationDelay: "120ms" }}
        aria-labelledby="activity-timeline-title"
      >
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pt-4">
          {/* Dois rótulos para o mesmo painel ocupavam duas linhas. Continuam os
              dois — na mesma linha, com o título mandando e a categoria como
              qualificador.

              O título estava a `text-base`: 16px, degrau que a escala desta
              casa não tem (micro 10 · rotulo 11 · corpo 13 · numero 20 ·
              heroi 34). E era o ÚNICO dos três painéis com tratamento próprio
              — "Exige decisão" e "Pulso do histórico" já abriam com o eyebrow
              de 11px. Três painéis irmãos com dois pesos de título fazem o
              olho procurar uma hierarquia que não existe. Agora abrem iguais,
              e o que distingue os painéis é a ORDEM, que é o que a régua diz. */}
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 id="activity-timeline-title" className="cc6-eyebrow">
              Linha do tempo
            </h2>
            <p className="text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
              · histórico comercial
            </p>
          </div>
          {filtersDirty ? (
            <button
              type="button"
              className="cc6-ghost-btn shrink-0"
              onClick={() => {
                setQuery("");
                setCategory("all");
                setPeriod("week");
              }}
            >
              Limpar filtros
            </button>
          ) : null}
        </header>

        <div className="mt-2 flex flex-col gap-2 px-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {/* MEDIDO no navegador, tema claro: este campo era uma caixa PRETA
                com texto preto. `app/globals.css` traz uma regra global
                `input, select, textarea` com fundo azul-noite cravado e SEM
                camada — e CSS fora de camada vence utilitário do Tailwind por
                construção, não por especificidade. O valor antigo (um hex
                escuro) perdia para ela do mesmo jeito: trocar o hex por token
                não bastava, porque o token nunca chegava a valer. Fundo e cor
                são um par, então os dois levam `!` e viram juntos — senão
                sobra metade do conserto, que é como o defeito nasceu. */}
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cliente, atividade ou responsável"
              aria-label="Buscar no histórico"
              className="w-full min-w-0 rounded-xl border border-[color:var(--atlas-border)]! bg-[var(--atlas-surface)]! px-3.5 py-2.5 text-corpo text-[var(--atlas-texto-forte)]! outline-none transition-colors placeholder:text-[var(--atlas-texto-fraco)] focus:border-[color:var(--atlas-accent)]! sm:max-w-xs"
            />
            <nav
              className="flex flex-wrap gap-1.5"
              aria-label="Período do histórico"
            >
              {PERIODS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPeriod(key)}
                  aria-pressed={period === key}
                  className={chipClass(period === key)}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
          <nav
            className="flex flex-wrap gap-1.5"
            aria-label="Categoria do histórico"
          >
            {CATEGORIES.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(key)}
                aria-pressed={category === key}
                className={chipClass(category === key)}
                title={`${categoryCount(key)} neste recorte · ${naJanela(key)} na janela carregada`}
              >
                {label}
                <strong className="font-semibold">{categoryCount(key)}</strong>
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-1 pb-2" aria-live="polite" aria-busy={loading}>
          {loading ? (
            <div className="space-y-2 px-5 pb-3 pt-2">
              {[1, 2, 3].map((item) => (
                <AtlasSkeleton key={item} className="h-24" />
              ))}
            </div>
          ) : timelineGroups.length ? (
            timelineGroups.map((group) => (
              <section
                key={group.key}
                className="cc6-reveal"
                style={{
                  animationDelay: `${Math.min(group.offset, 10) * 40}ms`,
                }}
              >
                <header className="flex items-center gap-3 px-5 pb-1 pt-3">
                  <h3 className="cc6-eyebrow text-[var(--atlas-texto-medio)]!">
                    {dayHeading(group.items[0].occurredAt, nowMs)}
                  </h3>
                  <span
                    className="cc6-hairline min-w-4 flex-1 self-center"
                    aria-hidden="true"
                  />
                  <span className="cc6-num text-micro text-[var(--atlas-texto-fraco)]">
                    {group.items.length}{" "}
                    {group.items.length === 1 ? "registro" : "registros"}
                  </span>
                </header>
                <div>
                  {group.items.map((event, index) => {
                    const isToday =
                      Boolean(todayKey) && dayKey(event.occurredAt) === todayKey;
                    const rowClass = `cc6-reveal group flex items-start gap-4 px-5 py-2.5 transition-colors hover:bg-[color-mix(in_srgb,var(--atlas-accent)_6%,transparent)] ${
                      index ? "cc6-hairline" : ""
                    }`;
                    const rowDelay = {
                      animationDelay: `${Math.min(group.offset + index + 1, 10) * 40}ms`,
                    };
                    const content = (
                      <>
                        <time
                          dateTime={event.occurredAt}
                          title={fullLabel(event.occurredAt)}
                          className="cc6-num w-16 shrink-0 pt-px text-right text-rotulo leading-6 text-[var(--atlas-texto-fraco)]"
                        >
                          {isToday
                            ? relativeTime(event.occurredAt, nowMs)
                            : timeLabel(event.occurredAt)}
                        </time>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            {/* 14px era o único degrau fora da escala no corpo
                                da lista. A 13px o título encosta na descrição
                                em tamanho, então o peso sobe de `medium` para
                                `semibold` e a hierarquia continua — ela passa
                                a vir de peso e tinta, não de meio degrau de
                                tamanho. `leading-6` fica: é ele que alinha a
                                primeira linha com a coluna da hora. */}
                            <strong className="text-corpo font-semibold leading-6 text-[var(--atlas-texto-forte)]">
                              {event.title}
                            </strong>
                            {/* Era um `cc6-chip` — 40 bordas numa tela só, uma
                                por linha. O texto continua; a borda, que ali não
                                separava nada, virou peso tipográfico. */}
                            <span className="cc6-num text-rotulo uppercase tracking-[0.12em] text-[var(--atlas-texto-medio)]!">
                              {activityCategoryLabels[event.category]}
                            </span>
                            {event.leadStatus ? (
                              <span className="cc6-num text-micro uppercase tracking-[0.12em] text-[var(--atlas-texto-fraco)]">
                                {event.leadStatus.replaceAll("_", " ")}
                              </span>
                            ) : null}
                          </span>
                          {event.description ? (
                            <span className="mt-0.5 block max-w-[70ch] text-corpo leading-relaxed text-[var(--atlas-texto-medio)]">
                              {event.description}
                            </span>
                          ) : null}
                          <span className="mt-0.5 block text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
                            {[event.leadName, event.actorName]
                              .filter(Boolean)
                              .join(" · ") || "Operação Atlas"}
                          </span>
                        </span>
                        {event.leadId ? (
                          <span className="shrink-0 self-center text-rotulo font-medium text-[var(--atlas-texto-medio)] transition-colors group-hover:text-[color:var(--atlas-accent)]">
                            Lead 360 <span aria-hidden="true">→</span>
                          </span>
                        ) : null}
                      </>
                    );
                    return event.leadId ? (
                      <Link
                        key={event.id}
                        href={`/leads/${event.leadId}`}
                        className={rowClass}
                        style={rowDelay}
                      >
                        {content}
                      </Link>
                    ) : (
                      <article key={event.id} className={rowClass} style={rowDelay}>
                        {content}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          ) : (
            <p className="cc6-hairline mt-2 px-5 py-6 text-corpo leading-5 text-[var(--atlas-texto-fraco)]">
              {data?.events.length ? (
                <>
                  Nenhum registro neste recorte —{" "}
                  <button
                    type="button"
                    className="cursor-pointer font-medium text-[color:var(--atlas-accent)] hover:underline"
                    onClick={() => {
                      setQuery("");
                      setCategory("all");
                      setPeriod("all");
                    }}
                  >
                    ver todo o histórico
                  </button>
                  .
                </>
              ) : data ? (
                "Ainda sem movimentações — novos contatos e registros autorizados aparecerão aqui."
              ) : (
                /* O MESMO defeito do pulso, em forma de frase. "Ainda sem
                   movimentações" afirma algo sobre o MUNDO (nada aconteceu);
                   com o fetch quebrado, o que se sabe é sobre a CARGA (não
                   chegou nada). O teste que separa os dois casos: "0 na janela
                   carregada" é verdade mesmo na falha — a janela veio vazia
                   mesmo. "Ainda sem movimentações" não é. */
                "O histórico não chegou nesta carga — isto é o painel cego, não a ausência de movimentação. Use Atualizar, no painel acima."
              )}
            </p>
          )}
        </div>

        <p className="cc6-hairline px-5 py-2.5 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
          Somente leitura · até 500 registros no escopo, respeitando
          organização, hierarquia e RLS · ordem cronológica, sem prioridade ou
          ação automática.
        </p>
      </section>

      {/* ── AUDITORIA ────────────────────────────────────────────────────────
          Telemetria desce. Os três números continuam inteiros — passaram de
          30px (fora da escala, três "heróis") para o degrau de comparação, e
          ganharam ao lado a série que dá sentido a eles. */}
      <section
        className="cc6-reveal"
        style={{ animationDelay: "200ms" }}
        aria-labelledby="activity-pulso-title"
      >
        <TiltShell className="cc6-panel px-5 py-4" delayMs={40}>
          <div className="flex flex-col gap-x-10 gap-y-4 lg:flex-row lg:items-start">
            <div className="shrink-0">
              <p className="cc6-eyebrow" id="activity-pulso-title">
                Pulso do histórico
              </p>
              {/* `.cc6-metric-label` era 11,5px — e o próprio comentário da
                  escala em globals.css nomeia o meio pixel (11.5, 12.5, 13.5)
                  como "o sintoma clássico" de quem ajustou no olho por não ter
                  degrau para apontar. O degrau existe: `text-rotulo`. A tinta
                  passa a ser a MESMA que os outros rótulos de métrica desta
                  página já usam, então a tela deixa de ter dois tratamentos
                  para o mesmo papel. */}
              <div
                className="mt-3 flex flex-wrap gap-x-8 gap-y-3"
                aria-busy={loading}
              >
                {pulso.map(([rotulo, valor]) => (
                  <div key={rotulo}>
                    <p className="cc6-metric-value text-numero leading-none">
                      {loading || valor === undefined ? "—" : valor}
                    </p>
                    <p className="mt-1 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                      {rotulo}
                    </p>
                  </div>
                ))}
              </div>
              {!loading && !data ? (
                <p className="mt-2 max-w-[26rem] text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                  <strong className="cc6-warn font-semibold">Sem lastro.</strong>{" "}
                  O histórico não chegou nesta carga. Os três ficam em
                  &ldquo;—&rdquo; e não em zero, porque zero aqui se leria como
                  operação parada.
                </p>
              ) : null}
            </div>

            <div className="min-w-0 flex-1">
              {loading ? (
                <AtlasSkeleton className="h-16" />
              ) : ritmo ? (
                <>
                  <p className="text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                    Registros por dia · {ritmo.dias.length}{" "}
                    {ritmo.dias.length === 1 ? "dia medido" : "dias medidos"} ·
                    pico {ritmo.pico.total} em {dayShort(ritmo.pico.iso)}
                    {ritmo.vazios
                      ? ` · ${ritmo.vazios} ${ritmo.vazios === 1 ? "dia sem registro nenhum" : "dias sem registro nenhum"}`
                      : ""}
                  </p>
                  {/* SVG à mão, sem canvas e sem biblioteca: `fillStyle` não
                      resolve `var(--token)` e quebraria só em runtime. Cada
                      barra é um dia; o traço fino é dia MEDIDO com zero, que é
                      diferente de dia não medido — esse fica fora da série. */}
                  <svg
                    viewBox="0 0 600 44"
                    preserveAspectRatio="none"
                    className="mt-2 h-11 w-full"
                    role="img"
                    aria-label={`Registros por dia em ${ritmo.dias.length} dias medidos, de ${dayShort(ritmo.dias[0].iso)} a ${dayShort(ritmo.dias[ritmo.dias.length - 1].iso)}. Pico de ${ritmo.pico.total} em ${dayShort(ritmo.pico.iso)}. ${ritmo.vazios} dias sem registro.`}
                  >
                    {ritmo.dias.map((dia, indice) => {
                      const passo = 600 / ritmo.dias.length;
                      const altura = dia.total
                        ? Math.max(3, (dia.total / ritmo.max) * 44)
                        : 2;
                      return (
                        <rect
                          key={dia.chave}
                          x={indice * passo + 1.5}
                          y={44 - altura}
                          width={Math.max(1.5, passo - 3)}
                          height={altura}
                          style={{
                            fill: dia.total
                              ? "var(--atlas-accent)"
                              : "var(--atlas-texto-fraco)",
                          }}
                        >
                          <title>{`${dayShort(dia.iso)}: ${dia.total} ${dia.total === 1 ? "registro" : "registros"}`}</title>
                        </rect>
                      );
                    })}
                  </svg>
                  {/* Legenda de eixo é apoio, não estado — daí o `!` contra o
                      âmbar que o tema claro joga em todo `.cc6-num`. */}
                  <p className="mt-1 flex justify-between text-micro leading-4 text-[var(--atlas-texto-fraco)]">
                    <span className="cc6-num text-[var(--atlas-texto-fraco)]!">
                      {dayShort(ritmo.dias[0].iso)}
                    </span>
                    <span className="cc6-num text-[var(--atlas-texto-fraco)]!">
                      {dayShort(ritmo.dias[ritmo.dias.length - 1].iso)}
                    </span>
                  </p>
                </>
              ) : (
                <p className="text-corpo leading-5 text-[var(--atlas-texto-medio)]">
                  <strong className="cc6-warn font-semibold">Sem lastro</strong>{" "}
                  para a série diária: a janela de 500 registros não cobre nenhum
                  dia inteiro, e desenhar o dia cortado ao meio diria &ldquo;não
                  houve&rdquo; onde a verdade é &ldquo;não medi&rdquo;.
                </p>
              )}
            </div>
          </div>
        </TiltShell>
      </section>
    </div>
  );
}
