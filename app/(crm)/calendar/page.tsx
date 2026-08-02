"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { supabase } from "@/lib/supabase";
import { lerIntencaoDaJanela, pedeCriar } from "@/lib/atlas/intencao-da-url";
import { AtlasEmpty, AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { CopilotContextAction } from "@/components/atlas/copilot-context-action";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";

type Item = {
  id: string;
  kind: "task" | "visit" | "follow_up";
  title: string;
  at: string;
  status: string;
  detail: string;
  href: string;
  leadId: string | null;
  overdue: boolean;
};

type CalendarData = {
  summary: {
    total: number;
    overdue: number;
    tasks: number;
    visits: number;
    followUps: number;
  };
  items: Item[];
};

type Window = "today" | "week" | "month" | "overdue" | "all";
type Sev = "crit" | "warn" | null;

const WINDOWS = [
  ["today", "Hoje"],
  ["week", "7 dias"],
  ["month", "Este mês"],
  ["overdue", "Atrasados"],
  ["all", "Todos"],
] as const satisfies ReadonlyArray<readonly [Window, string]>;

const WINDOW_TITLES: Record<Window, string> = {
  today: "Compromissos de hoje",
  week: "Próximos sete dias",
  month: "Agenda deste mês",
  overdue: "Compromissos atrasados",
  all: "Agenda completa",
};

// O verbo já nomeia o tipo (tarefa/visita/lead): um dado só por linha.
const KIND_ACTION = {
  task: "Ver tarefa",
  visit: "Preparar visita",
  follow_up: "Abrir lead",
} as const;

/* Semânticos CC-6: rose para atrasado, amber para hoje; futuro fica neutro.
 *
 * O crítico estava CRAVADO em hex enquanto o irmão ao lado, na MESMA linha, já
 * era token — duas metades do mesmo par decididas em lugares diferentes. O
 * literal era exatamente o valor escuro de `--atlas-estado-perigo`, então a
 * troca é invisível no tema escuro e conserta o claro: lá o token escurece de
 * propósito e o hex não acompanha, deixando a faixa de severidade do atraso
 * clara justamente no tema em que o dono trabalha.
 *
 * O VALOR NÃO É CITADO AQUI DE PROPÓSITO: `check-cor-cravada.mjs` lê o arquivo
 * cru e conta `#rrggbb` em qualquer posição — comentário inclusive. Escrever o
 * hex para EXPLICAR que ele saiu faria o portão contar dois onde havia um. É a
 * mesma lição que `check-texto-cortado.mjs` já aprendeu do outro lado (lá o
 * portão passou a descartar comentários antes de inspecionar); deste lado o
 * portão ainda não descarta, então quem escreve é que não cita. */
const SEV_INK = {
  crit: "var(--atlas-estado-perigo)",
  warn: "var(--atlas-estado-atencao)",
} as const;

const dayKey = (value: string) =>
  new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));

const weekdayName = (value: string) => {
  const name = new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(
    new Date(value),
  );
  return name.charAt(0).toUpperCase() + name.slice(1);
};

const shortDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));

// "seg." → "seg": o ponto é ruído em legenda de eixo de 10px.
const weekdayShort = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
    .format(new Date(value))
    .replace(".", "");

const timeLabel = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

type DiaCarga = {
  key: string;
  iso: string;
  weekday: string;
  count: number;
  today: boolean;
};

/**
 * A ÚNICA PERGUNTA DESTA TELA QUE UM NÚMERO NÃO RESPONDE.
 *
 * O corretor não organiza a agenda só para saber o que vem; ele organiza para
 * saber ONDE ENCAIXAR a próxima visita. "12 compromissos em 7 dias" não diz
 * nada sobre isso: 12 podem ser dois dias lotados e cinco vazios, ou quase dois
 * por dia. A resposta é a FORMA da distribuição, e forma não cabe em número —
 * é o único caso desta tela em que o gráfico ganha do dígito.
 *
 * Sete barras, uma por dia, altura relativa ao dia mais cheio. Hoje sai em
 * âmbar, o mesmo semântico que a lista já usa — a tela não ganha um segundo
 * vocabulário de cor. A leitura em texto ao lado nomeia o dia mais livre, para
 * quem não lê forma (e para o leitor de tela, que recebe a série inteira no
 * `aria-label`).
 *
 * SVG à mão, sem biblioteca e sem canvas: `fill="currentColor"` deixa a cor
 * sair do token pela cascata, então a barra vira com o tema. `fillStyle` de
 * canvas não resolveria `var(--token)` e quebraria em silêncio, só em runtime.
 *
 * Zero número inventado: cada barra é a contagem de itens reais daquele dia,
 * da mesma lista que alimenta a linha do tempo. Sem dado, o componente não é
 * renderizado — quem chama mostra a frase do que falta.
 */
function CargaDeSeteDias({ dias }: { dias: DiaCarga[] }) {
  const maior = Math.max(...dias.map((dia) => dia.count), 1);
  const total = dias.reduce((soma, dia) => soma + dia.count, 0);
  const maisLivre = dias.reduce(
    (melhor, dia) => (dia.count < melhor.count ? dia : melhor),
    dias[0],
  );
  const SLOT = 10;
  const ALTURA = 24;
  const LARGURA = SLOT * dias.length;
  const alturaDaBarra = (count: number) =>
    Math.max(2, ((ALTURA - 3) * count) / maior);

  return (
    <div className="min-w-[184px] flex-1 basis-[184px] sm:max-w-[252px]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="cc6-eyebrow">Carga · 7 dias</span>
        <span className="cc6-num text-micro text-[var(--atlas-texto-medio)]">
          {total === 0
            ? "nada agendado"
            : `mais livre ${maisLivre.weekday} ${shortDate(maisLivre.iso)} · ${maisLivre.count}`}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        preserveAspectRatio="none"
        className="mt-1.5 block h-6 w-full text-[color:var(--atlas-accent)]"
        role="img"
        aria-label={`Compromissos por dia nos próximos sete dias — ${dias
          .map((dia) => `${dia.weekday} ${shortDate(dia.iso)}: ${dia.count}`)
          .join("; ")}.`}
      >
        <rect
          x="0"
          y={ALTURA - 1}
          width={LARGURA}
          height="1"
          fill="currentColor"
          opacity="0.22"
        />
        {dias.map((dia, index) =>
          dia.count === 0 ? null : (
            <rect
              key={dia.key}
              className={dia.today ? "cc6-warn" : undefined}
              x={index * SLOT + 1.5}
              y={ALTURA - 1 - alturaDaBarra(dia.count)}
              width={SLOT - 3}
              height={alturaDaBarra(dia.count)}
              rx="1"
              fill="currentColor"
            />
          ),
        )}
      </svg>
      <div className="mt-1 grid grid-cols-7 text-center">
        {dias.map((dia) => (
          <span
            key={dia.key}
            className={`cc6-num text-micro leading-3 ${
              dia.today ? "cc6-warn" : "text-[var(--atlas-texto-fraco)]"
            }`}
          >
            {dia.weekday}
          </span>
        ))}
      </div>
    </div>
  );
}

function EventRow({
  item,
  sev,
  withDate,
  overdueTag,
  divider,
  delay,
}: {
  item: Item;
  sev: Sev;
  withDate?: boolean;
  overdueTag?: boolean;
  divider: boolean;
  delay: number;
}) {
  return (
    <Link
      href={item.href}
      className={`cc6-reveal group flex items-center gap-4 px-5 py-3 transition-colors hover:bg-[color-mix(in_srgb,var(--atlas-accent)_5%,transparent)] ${divider ? "cc6-hairline" : ""} ${sev ? "cc6-sev-band" : ""}`}
      style={
        {
          animationDelay: `${delay}ms`,
          ...(sev ? { "--cc6-sev": SEV_INK[sev] } : {}),
        } as CSSProperties
      }
      data-kind={item.kind}
      data-overdue={item.overdue}
    >
      <time
        dateTime={item.at}
        className={`cc6-num shrink-0 text-corpo ${withDate ? "w-24" : "w-12"} ${
          sev === "crit"
            ? "cc6-crit"
            : sev === "warn"
              ? "cc6-warn"
              : "text-[var(--atlas-texto-medio)]"
        }`}
      >
        {withDate ? `${shortDate(item.at)} · ` : ""}
        {timeLabel(item.at)}
      </time>
      {/* ── AS DUAS FRASES DA LINHA NÃO PODEM SER CORTADAS ───────────────────
          Título e detalhe vinham com `truncate` — `nowrap` + reticências numa
          FRASE. O detalhe é literalmente "com quem é o compromisso": "Ana
          Beatriz Nogueira · prioridade alta" virava "Ana Beatriz Noguei…" e o
          corretor perdia a prioridade, que é a metade que decide a ordem.
          É o mesmo defeito que custou 58% da instrução principal do Lead 360.
          Quebra de linha DECLARADA (`whitespace-normal`), não presumida: clamp
          e wrap já falharam neste produto por um `nowrap` herdado de outro
          lugar — regra que depende da ausência de outra funciona por sorte. */}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <strong className="max-w-full whitespace-normal break-words text-corpo font-medium text-[var(--atlas-texto-forte)]">
            {item.title}
          </strong>
          {overdueTag ? (
            <span className="cc6-crit cc6-num text-micro tracking-[0.14em] uppercase">
              Em atraso
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block whitespace-normal break-words text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
          {item.detail}
        </span>
      </span>
      <span className="shrink-0 text-rotulo font-medium text-[var(--atlas-texto-medio)] transition-colors group-hover:text-[color:var(--atlas-accent)]">
        {KIND_ACTION[item.kind]} <span aria-hidden="true">→</span>
      </span>
    </Link>
  );
}

export default function CalendarPage() {
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [window, setWindow] = useState<Window>("week");
  const [live, setLive] = useState("connecting");
  const [encaminhandoCriacao, setEncaminhandoCriacao] = useState(false);
  /* O INSTANTE DE REFERÊNCIA DA IDADE DO ATRASO, ANCORADO NA LEITURA.
   *
   * `atrasoMaisAntigo` chamava `Date.now()` DENTRO do `useMemo`, o que o
   * `react-hooks/purity` reprova como erro — e com razão prática, não só
   * teórica: o memo depende de `overdueItems`, mas o relógio que ele lia não
   * era dependência de nada. Trocar de aba, reconectar o realtime ou qualquer
   * re-render recalculava a idade contra um "agora" novo, então "há 2d" podia
   * virar "há 3d" sem que nenhum dado tivesse mudado.
   *
   * A idade de um atraso é medida CONTRA O MOMENTO EM QUE A AGENDA FOI LIDA —
   * é isso que a frase quer dizer. O carimbo é gravado no `load`, que é
   * callback assíncrono e não render: ali `Date.now()` é legítimo. Nulo até a
   * primeira resposta, pelo mesmo motivo de sempre — sem leitura não há idade,
   * e "há 0d" seria um número inventado sobre um atraso que ninguém contou. */
  const [lidoEm, setLidoEm] = useState<number | null>(null);
  const router = useRouter();

  /**
   * A intenção que vem na URL — e por que a agenda a ENCAMINHA em vez de fingir
   * que cria.
   *
   * `lib/atlas/navigation.ts` declara a ação primária deste destino como
   * `/calendar?create=1` ("Novo compromisso"), prometendo que o formulário de
   * novo compromisso abre sozinho. A tela nunca leu o parâmetro: quem clicava
   * chegava na linha do tempo com nada aberto e ainda tinha que descobrir onde
   * se cria um compromisso. Promessa decorativa — e invisível em teste, porque
   * a agenda ABRE, só não faz o que o botão diz.
   *
   * Só que esta tela é de LEITURA: `/api/v1/calendar` tem apenas GET, e a
   * agenda é a junção de tarefas, visitas e follow-ups que nascem em outro
   * lugar. O único formulário de compromisso do produto é o de `/tasks` — o
   * mesmo destino que o cabeçalho e o estado vazio desta tela já apontam.
   * Desenhar um formulário aqui criaria duas verdades sobre "criar tarefa"
   * (recorrência, responsável, vínculo com a lead), que é a classe de defeito
   * que este repositório mais pagou.
   *
   * Então cumprimos o RESULTADO prometido em vez da letra: a pessoa chega ao
   * formulário já aberto, sem clicar de novo. `replace` e não `push` de
   * propósito — com `push`, voltar cairia outra vez em `/calendar?create=1` e
   * a pessoa ficaria presa no encaminhamento.
   *
   * A leitura vem do módulo compartilhado, nunca de um `URLSearchParams` local:
   * a lista de chaves é fechada, então `?create=9`, parâmetro ausente ou URL
   * malformada devolvem `null` e a agenda abre exatamente como sempre abriu —
   * intenção não reconhecida jamais vira recorte silencioso. E o efeito de
   * montagem substitui `useSearchParams` pelo mesmo motivo de `/leads`: o hook
   * exigiria fronteira <Suspense> na página cliente inteira por causa de um
   * parâmetro, e a semântica desejada já é esta — a URL define a abertura, a
   * pessoa assume a partir daí.
   */
  useEffect(() => {
    if (!pedeCriar(lerIntencaoDaJanela())) return;
    setEncaminhandoCriacao(true);
    router.replace("/tasks?create=1");
  }, [router]);

  const token = useCallback(
    async () =>
      (await supabase.auth.getSession()).data.session?.access_token || "",
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/calendar", {
        headers: { Authorization: `Bearer ${await token()}` },
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error();
      setData(body.data || body);
      setLidoEm(Date.now());
      setError("");
    } catch {
      setError("Não foi possível carregar sua agenda comercial.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase.channel("commercial-calendar");
    for (const table of ["tasks", "lead_visits", "leads"]) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => void load(),
      );
    }
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

  const signals = useMemo(() => {
    const now = new Date();
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const endDay = start + 86_400_000;
    const endWeek = start + 7 * 86_400_000;
    const endMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1,
    ).getTime();
    const items = data?.items ?? [];
    const noIntervalo = (from: number, to: number) =>
      items.filter((item) => {
        const at = new Date(item.at).getTime();
        return at >= from && at < to;
      }).length;

    // "Este mês" e "Todos" eram as duas únicas abas sem número — e "Todos" é
    // exatamente a que responde "quanto existe ao todo". Contar as cinco custa
    // uma passada na mesma lista já em memória.
    return {
      overdue: items.filter((item) => item.overdue).length,
      today: noIntervalo(start, endDay),
      nextSevenDays: noIntervalo(start, endWeek),
      thisMonth: noIntervalo(start, endMonth),
      all: items.length,
    };
  }, [data]);

  /**
   * A carga dos próximos sete dias — a série que vira gráfico.
   *
   * Sai da MESMA lista que a linha do tempo desenha, não de um segundo
   * endereço: agenda com duas verdades sobre o próprio dia é a classe de
   * defeito que este repositório mais pagou. Sem `data` devolve `null`, e o
   * painel diz o que falta em vez de desenhar sete barras zeradas — zero
   * parece agenda livre, nulo diz que ninguém respondeu.
   */
  const cargaDaSemana = useMemo<DiaCarga[] | null>(() => {
    const items = data?.items;
    if (!items) return null;
    const now = new Date();
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    return Array.from({ length: 7 }, (_, index) => {
      const from = start + index * 86_400_000;
      const to = from + 86_400_000;
      const iso = new Date(from).toISOString();
      return {
        key: dayKey(iso),
        iso,
        weekday: weekdayShort(iso),
        count: items.filter((item) => {
          const at = new Date(item.at).getTime();
          return at >= from && at < to;
        }).length,
        today: index === 0,
      };
    });
  }, [data]);

  const visible = useMemo(() => {
    const now = new Date();
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).getTime();
    const endDay = start + 86_400_000;
    const endWeek = start + 7 * 86_400_000;
    const endMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1,
    ).getTime();

    return (data?.items ?? []).filter((item) => {
      const at = new Date(item.at).getTime();
      if (window === "overdue") return item.overdue;
      if (window === "today") return at >= start && at < endDay;
      if (window === "week") return at >= start && at < endWeek;
      if (window === "month") return at >= start && at < endMonth;
      return true;
    });
  }, [data, window]);

  // Nos recortes futuros, todo o atraso fica fixado no topo (herda o papel do
  // antigo card "Atenção imediata"); em "Atrasados"/"Todos" ele já está na lista.
  const pinOverdue = window !== "overdue" && window !== "all";

  const overdueItems = useMemo(
    () =>
      (data?.items ?? [])
        .filter((item) => item.overdue)
        .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()),
    [data],
  );

  const groups = useMemo(() => {
    const source = pinOverdue
      ? visible.filter((item) => !item.overdue)
      : visible;
    const now = new Date();
    const todayKey = dayKey(now.toISOString());
    const tomorrowKey = dayKey(
      new Date(now.getTime() + 86_400_000).toISOString(),
    );
    const map = new Map<
      string,
      { name: string; date: string; today: boolean; items: Item[] }
    >();
    for (const item of source) {
      const key = dayKey(item.at);
      let group = map.get(key);
      if (!group) {
        group = {
          name:
            key === todayKey
              ? "Hoje"
              : key === tomorrowKey
                ? "Amanhã"
                : weekdayName(item.at),
          date: shortDate(item.at),
          today: key === todayKey,
          items: [],
        };
        map.set(key, group);
      }
      group.items.push(item);
    }
    return [...map.entries()].map(([key, group]) => ({ key, ...group }));
  }, [visible, pinOverdue]);

  /* Quanto tempo o atraso mais velho está esperando. A lista já dizia QUANTOS;
     não dizia HÁ QUANTO — e é a idade, não a contagem, que separa "atrasei o
     dia" de "perdi o cliente". `overdueItems` já vem em ordem crescente, então
     o primeiro é o mais antigo. */
  const atrasoMaisAntigo = useMemo(() => {
    const primeiro = overdueItems[0];
    if (!primeiro || lidoEm === null) return null;
    const dias = Math.floor(
      (lidoEm - new Date(primeiro.at).getTime()) / 86_400_000,
    );
    return dias >= 1 ? `mais antigo há ${dias}d` : "mais antigo hoje";
  }, [overdueItems, lidoEm]);

  const hasOverduePin = pinOverdue && overdueItems.length > 0;

  /* O NÚMERO DA ABA NÃO CONTA O QUE O PIN MOSTRA — e nada dizia isso.
   *
   * A aba conta o RECORTE: `signals.nextSevenDays` é `[hoje 00:00, +7d)`, e
   * `visible` usa exatamente o mesmo intervalo. O pin, não: `overdueItems` sai
   * de `data.items` filtrado só por `item.overdue`, sem janela nenhuma — e
   * atraso de dias anteriores está, por definição, FORA de todo recorte que
   * começa hoje. Com 5 atrasos de ontem, a aba "7 dias 12" encabeça uma lista
   * de 17 linhas. Duas contagens verdadeiras e nenhuma explicando a outra: é a
   * mesma classe de "número sem contexto" que os chips de composição já
   * pagaram (`summary` conta a agenda inteira, a lista mostra um recorte).
   *
   * A partição sai do PRÓPRIO `visible`, por identidade de objeto, e não de uma
   * segunda cópia do predicado de janela — `filter` preserva as referências de
   * `data.items`. Reescrever "está no recorte?" aqui criaria a segunda versão
   * da regra que diverge da primeira na próxima mudança, que é o defeito que
   * este repositório mais pagou. Zero número inventado: é a mesma lista,
   * repartida. */
  const atrasoForaDoRecorte = useMemo(() => {
    if (!hasOverduePin) return 0;
    const noRecorte = new Set(visible);
    return overdueItems.filter((item) => !noRecorte.has(item)).length;
  }, [hasOverduePin, visible, overdueItems]);

  const summary = data?.summary;
  const composition = [
    ["Tarefas", summary?.tasks],
    ["Visitas", summary?.visits],
    ["Follow-ups", summary?.followUps],
    ["Total", summary?.total],
  ] as const;

  return (
    <div
      className="space-y-4 pb-8"
      data-phase="46-commercial-calendar"
      data-evolution-phase="39"
      data-calendar-layout="time-first"
    >
      <PageHeader
        eyebrow="Agenda comercial · Fonte única"
        title="Seu tempo comercial, em ordem"
        description="Atrasos em rosa, hoje em âmbar — tarefas, visitas e follow-ups em uma única linha do tempo."
        action={{
          // O botão dizia "Criar tarefa" e entregava a fila de tarefas, com o
          // formulário fechado — a mesma promessa decorativa da URL. `?create=1`
          // abre o painel que já existe lá; nenhum caminho novo.
          href: "/tasks?create=1",
          label: "Criar tarefa",
          priority: "secondary",
        }}
      />

      {/*
       * Trocar de tela sozinha se lê como bug: a pessoa clicou em "Novo
       * compromisso" na Agenda e a página mudou sem explicação. O aviso nomeia
       * o que está acontecendo (o compromisso nasce em Tarefas) e o link é a
       * saída manual caso a navegação do cliente não complete.
       */}
      {encaminhandoCriacao ? (
        <div
          role="status"
          className="cc6-panel flex flex-wrap items-center justify-between gap-3 px-5 py-3"
        >
          <p className="min-w-0 text-corpo text-[var(--atlas-texto-forte)]">
            <strong className="font-semibold">Novo compromisso</strong>{" "}
            <span className="text-[var(--atlas-texto-medio)]">
              — o formulário fica em Tarefas, onde o compromisso é criado.
              Abrindo lá para você.
            </span>
          </p>
          <Link href="/tasks?create=1" className="atlas-button-secondary">
            Abrir agora
          </Link>
        </div>
      ) : null}

      {error ? (
        <AtlasRecoverableError
          description={error}
          onRetry={() => void load()}
          busy={loading}
        />
      ) : null}

      <section aria-labelledby="atlas-calendar-timeline-title">
        <TiltShell
          className="cc6-panel cc6-reveal overflow-hidden"
          delayMs={40}
          maxDeg={2}
        >
          {/* Quatro camadas de titulação vinham antes do primeiro compromisso:
              "AGENDA COMERCIAL · FONTE ÚNICA" → "Seu tempo comercial, em ordem"
              → "LINHA DO TEMPO" → "Próximos sete dias" — sendo que a última
              repete a aba já marcada logo abaixo. Nada some; o rótulo e o
              título passam a dividir UMA linha de base, e o pulso do sistema
              (Sincronizada/Conectando) desce para a faixa de auditoria: é o que
              a régua chama de auditoria, e auditoria não abre a tela. */}
          <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pt-4 pb-2.5">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <p className="cc6-eyebrow">Linha do tempo</p>
              <h2
                id="atlas-calendar-timeline-title"
                className="text-lg font-semibold tracking-tight text-[var(--atlas-texto-forte)]"
              >
                {WINDOW_TITLES[window]}
              </h2>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="cc6-ghost-btn disabled:opacity-50"
              >
                {loading ? "Atualizando…" : "Atualizar"}
              </button>
              <CopilotContextAction
                label="✦ Preparar meu dia"
                prompt="Organize minha agenda comercial em uma sequência prática: atrasos primeiro, contatos de maior impacto e compromissos que exigem preparação. Apenas sugira; não conclua ou crie tarefas."
                context={{
                  source: "commercial_calendar",
                  workspace: "calendar",
                  contextLabel: "Agenda comercial",
                  returnHref: "/calendar",
                }}
                className="atlas-button-primary"
              />
            </div>
          </header>

          <div className="flex flex-wrap items-end justify-between gap-x-5 gap-y-3 px-5 pb-3.5">
            <nav
              className="flex flex-wrap gap-1.5"
              aria-label="Período da agenda"
            >
              {WINDOWS.map(([key, label]) => {
                const active = window === key;
                const count =
                  key === "overdue"
                    ? signals.overdue
                    : key === "today"
                      ? signals.today
                      : key === "week"
                        ? signals.nextSevenDays
                        : key === "month"
                          ? signals.thisMonth
                          : signals.all;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setWindow(key)}
                    aria-pressed={active}
                    className={`cc6-ghost-btn ${
                      active
                        ? "border-[color:var(--atlas-accent)]! bg-[color-mix(in_srgb,var(--atlas-accent)_9%,transparent)]! text-[var(--atlas-texto-forte)]!"
                        : ""
                    }`}
                  >
                    {label}
                    {/* Sem `data` o contador ficava em 0 nas três abas que já
                        tinham número — e 0 numa agenda que não respondeu lê-se
                        como "dia livre". Agora o dígito só aparece quando há
                        lastro; sem ele a aba fica sem número, que é a verdade. */}
                    {!loading && data ? (
                      <strong
                        className={`cc6-num font-semibold ${
                          key === "overdue" && count
                            ? "cc6-crit"
                            : key === "today" && count
                              ? "cc6-warn"
                              : ""
                        }`}
                      >
                        {count}
                      </strong>
                    ) : null}
                  </button>
                );
              })}
            </nav>
            {!loading && cargaDaSemana ? (
              <CargaDeSeteDias dias={cargaDaSemana} />
            ) : !loading && !cargaDaSemana ? (
              <p className="cc6-num text-micro leading-4 text-[var(--atlas-texto-medio)]">
                Carga · 7 dias sem lastro — a agenda não respondeu.
              </p>
            ) : null}
          </div>

          <div className="flex flex-col" aria-live="polite" aria-busy={loading}>
            {loading ? (
              <div className="space-y-2 px-5 pb-5">
                {[1, 2, 3].map((item) => (
                  <AtlasSkeleton key={item} className="h-24" />
                ))}
              </div>
            ) : hasOverduePin || groups.length ? (
              <>
                {hasOverduePin ? (
                  <section
                    className="cc6-reveal"
                    style={{ animationDelay: "80ms" }}
                    aria-labelledby="atlas-calendar-overdue-title"
                  >
                    <header className="cc6-hairline flex items-baseline justify-between gap-3 px-5 pt-3.5 pb-1">
                      <h3
                        id="atlas-calendar-overdue-title"
                        className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-corpo font-semibold tracking-tight"
                      >
                        <span className="cc6-crit">Em atraso</span>
                        <span className="cc6-num text-rotulo font-normal text-[var(--atlas-texto-fraco)]">
                          resolver primeiro
                          {atrasoMaisAntigo ? ` · ${atrasoMaisAntigo}` : ""}
                          {/* A frase que reconcilia as duas contagens. Sem ela,
                              a aba diz 12 e a lista mostra 17 sem defesa. */}
                          {atrasoForaDoRecorte
                            ? ` · ${atrasoForaDoRecorte} de dias anteriores`
                            : ""}
                        </span>
                      </h3>
                      {/* ── O NÚMERO QUE DECIDE, NO DEGRAU QUE DECIDE ─────────
                          A régua manda o que exige DECISÃO ser maior que o que
                          INFORMA. Estava ao contrário: o maior tipo do painel
                          era o título da janela ("Próximos sete dias", 18px),
                          que só informa em qual aba você está — e o número que
                          governa os próximos trinta minutos do corretor, o
                          tamanho da pilha de atraso, saía em 11px, o mesmo
                          degrau da contagem meramente informativa de cada dia.
                          `numero` (20px) é literalmente "o número que se
                          compara"; sobe para ele e passa o título. A contagem
                          por dia FICA em 11px de propósito: é o contraste entre
                          os dois degraus que diz qual dos dois cobra ação.
                          Cor e classes não mudam — `.cc6-num.cc6-crit` já tem o
                          override de tema claro escrito exatamente para "onde o
                          número é grande e precisa ser lido de relance". */}
                      <span
                        className="cc6-crit cc6-num shrink-0 text-numero leading-none"
                        aria-label={`${overdueItems.length} compromissos em atraso${
                          atrasoForaDoRecorte
                            ? `, sendo ${atrasoForaDoRecorte} de dias anteriores a este recorte`
                            : ""
                        }`}
                      >
                        {overdueItems.length}
                      </span>
                    </header>
                    {overdueItems.map((item, index) => (
                      <EventRow
                        key={`${item.kind}-${item.id}`}
                        item={item}
                        sev="crit"
                        withDate
                        divider={index > 0}
                        delay={100 + Math.min(index, 6) * 45}
                      />
                    ))}
                  </section>
                ) : null}
                {groups.map((group, groupIndex) => {
                  const baseDelay = 120 + Math.min(groupIndex, 4) * 70;
                  return (
                    <section
                      key={group.key}
                      className="cc6-reveal"
                      style={{ animationDelay: `${baseDelay}ms` }}
                      data-today={group.today}
                    >
                      <header className="cc6-hairline flex items-baseline justify-between gap-3 px-5 pt-3.5 pb-1">
                        <h3 className="flex items-baseline gap-2 text-corpo font-semibold tracking-tight">
                          <span
                            className={
                              group.today ? "cc6-warn" : "text-[var(--atlas-texto-forte)]"
                            }
                          >
                            {group.name}
                          </span>
                          <span className="cc6-num text-rotulo font-normal text-[var(--atlas-texto-fraco)]">
                            {group.date}
                          </span>
                        </h3>
                        <span
                          className="cc6-num text-rotulo text-[var(--atlas-texto-fraco)]"
                          aria-label={`${group.items.length} compromissos`}
                        >
                          {group.items.length}
                        </span>
                      </header>
                      {group.items.map((item, index) => (
                        <EventRow
                          key={`${item.kind}-${item.id}`}
                          item={item}
                          sev={
                            item.overdue
                              ? "crit"
                              : group.today
                                ? "warn"
                                : null
                          }
                          overdueTag={item.overdue && window === "all"}
                          divider={index > 0}
                          delay={baseDelay + 20 + Math.min(index, 6) * 40}
                        />
                      ))}
                    </section>
                  );
                })}
              </>
            ) : (
              <div className="px-5 py-6">
                <AtlasEmpty
                  reason="completed"
                  eyebrow={
                    window === "all"
                      ? "Agenda sem compromissos"
                      : "Período sem pendências"
                  }
                  title={
                    window === "all"
                      ? "Agenda vazia"
                      : "Agenda livre neste período"
                  }
                  description={
                    window === "all"
                      ? "Nenhum compromisso registrado. Comece criando uma tarefa comercial."
                      : "Nenhum compromisso exige atenção neste recorte. Crie uma tarefa ou consulte a agenda completa."
                  }
                  action={
                    window === "all" ? (
                      // Mesmo motivo do cabeçalho: quem chega aqui pela agenda
                      // vazia pediu para criar, não para ver outra lista.
                      <Link
                        href="/tasks?create=1"
                        className="atlas-button-primary"
                      >
                        Criar tarefa
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setWindow("all")}
                        className="atlas-button-secondary"
                      >
                        Ver agenda completa
                      </button>
                    )
                  }
                />
              </div>
            )}
          </div>

          {/* ── A FAIXA DE AUDITORIA, UMA SÓ ──────────────────────────────────
              Eram DUAS faixas com hairline própria (composição, depois a nota)
              — dois filetes para abrir a mesma zona. Um filete quer dizer "aqui
              começa outra coisa"; o segundo não começava nada. Viraram uma.

              E os quatro chips eram números sem contexto: `summary` conta a
              agenda INTEIRA, enquanto a lista logo acima mostra um recorte (7
              dias, por padrão). "Tarefas 12" ao pé de uma lista com 4 tarefas
              são dois universos sem nenhum rótulo dizendo qual é qual. O
              escopo passa a estar escrito; a contagem DO RECORTE já está nas
              abas, agora nas cinco. */}
          <div className="cc6-hairline mt-3 px-5 py-2.5">
            <div
              className="flex flex-wrap items-center gap-x-3 gap-y-2"
              aria-label="Composição da agenda"
            >
              <span className="cc6-eyebrow">Agenda inteira</span>
              <span className="flex flex-wrap items-center gap-1.5">
                {composition.map(([label, value]) => (
                  <span key={label} className="cc6-chip">
                    {label}
                    <strong className="font-semibold text-[var(--atlas-texto-forte)]">
                      {loading || value === undefined ? "—" : value}
                    </strong>
                  </span>
                ))}
              </span>
              <span className="ml-auto">
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
                    ? "Sincronizada"
                    : live === "degraded"
                      ? "Atualização manual"
                      : "Conectando"}
                </StatusBadge>
              </span>
            </div>
            <p className="mt-2 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
              Organização, hierarquia e RLS aplicadas pela API · atualizações
              apenas reorganizam a agenda · nenhuma ação é concluída e nenhum
              cliente é contatado automaticamente.
            </p>
          </div>
        </TiltShell>
      </section>
    </div>
  );
}
