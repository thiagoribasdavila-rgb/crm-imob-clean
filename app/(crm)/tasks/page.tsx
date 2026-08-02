"use client";

import Link from "next/link";
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
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";

type Task = {
  id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  priority: string;
  status: string;
  lead_id: string | null;
  assigned_to: string | null;
  recurrence_id?: string | null;
  assigneeName: string;
  mine: boolean;
  overdue: boolean;
  today: boolean;
  priorityScore: number;
  lead?: { id: string; name: string | null; purpose: string | null } | null;
};

type Center = {
  scope: { role: string; actorId: string };
  summary: {
    open: number;
    completed: number;
    overdue: number;
    today: number;
    high: number;
    withoutDueDate: number;
    unassigned: number;
    mine: number;
  };
  tasks: Task[];
  byOwner: Array<{
    id: string;
    name: string;
    open: number;
    overdue: number;
    today: number;
    high: number;
  }>;
  creationOptions: {
    leads: Array<{
      id: string;
      name: string | null;
      assigned_to: string | null;
      status: string | null;
    }>;
    assignees: Array<{ id: string; full_name: string | null }>;
    defaults: { assigneeId: string; priority: string };
  };
};

type DailyAssistant = {
  summary: { steps: number; now: number; today: number; planned: number };
  sequence: Array<{
    id: string;
    position: number;
    kind: "task" | "lead" | "visit";
    title: string;
    reason: string;
    action: string;
    href: string;
    dueAt: string | null;
    urgency: "now" | "today" | "planned";
  }>;
  method: {
    llmCost: number;
    explainable: boolean;
    humanDecisionRequired: boolean;
  };
};

/**
 * Os recortes da fila, e o TAMANHO de cada um.
 *
 * Antes eram seis chips idênticos de 11px, e a régua estava invertida: o
 * ordinal do passo do assistente (1, 2, 3 — um número que não se compara com
 * nada) era o maior número da tela, a 20px com `cc6-metric-value`, enquanto
 * "vencidas 12" — o número que decide o dia — vivia no menor tipo da página.
 *
 * Aqui o tamanho passa a ser consequência: prazo vencido é herói, o combinado
 * de hoje e a fila sem dono são números, o resto informa e continua chip.
 *
 * `unassigned` e `high` são recortes NOVOS. Os dois números já eram exibidos no
 * rodapé do painel (abaixo da dobra) e não davam para clicar: a tela cobrava
 * "3 sem responsável" e não deixava chegar nas três. Número de decisão que não
 * vira filtro é número que só serve para preocupar.
 */
const TASK_VIEWS = [
  ["overdue", "Vencidas"],
  ["today", "Hoje"],
  ["unassigned", "Sem responsável"],
  ["priority", "Prioridade"],
  ["high", "Alta prioridade"],
  ["mine", "Minha fila"],
  ["team", "Equipe visível"],
  ["no_due", "Sem prazo"],
] as const;

type View = (typeof TASK_VIEWS)[number][0];

const VIEW_TIER: Record<View, "heroi" | "numero" | "chip"> = {
  overdue: "heroi",
  today: "numero",
  unassigned: "numero",
  priority: "chip",
  high: "chip",
  mine: "chip",
  team: "chip",
  no_due: "chip",
};

// Cor só quando o número acusa alguma coisa — zero vencidas não é vermelho.
const VIEW_INK: Partial<Record<View, string>> = {
  overdue: "cc6-crit",
  today: "cc6-warn",
  unassigned: "cc6-warn",
};

const EMPTY_FORM = {
  title: "",
  description: "",
  dueAt: "",
  priority: "media",
  leadId: "",
  assigneeId: "",
  cadence: "",
  endsAt: "",
  maxOccurrences: 10,
};

const KIND_LABEL = {
  task: "Tarefa",
  lead: "Lead",
  visit: "Visita",
} as const;

const HIGH_PRIORITY = new Set(["alta", "high", "critical"]);

/* Semânticos CC-6: perigo para vencido, atenção para hoje; futuro fica neutro.
   O `crit` era um literal cravado — exatamente o valor ESCURO do token de
   perigo. A faixa de severidade não virava com o tema: no claro, onde o dono
   trabalha, ela continuava rosa-claro sobre painel branco em vez do vermelho
   que o token já define ali. Uma cor cravada a menos, e a faixa passa a dizer a
   mesma coisa nos dois temas. */
const SEV_INK = {
  crit: "var(--atlas-estado-perigo)",
  warn: "var(--atlas-estado-atencao)",
} as const;
const STEP_SEV = { now: "crit", today: "warn", planned: null } as const;

/**
 * O ESTADO DO PRAZO — e por que ele ganha forma, e não mais uma cor.
 *
 * ── O que a linha já dizia, e por quantos canais ───────────────────────────
 * Vencida e "para hoje" chegavam ao corretor por DOIS canais, e os dois são a
 * mesma coisa: a faixa lateral `cc6-sev-band` (2px de cor) e a tinta do texto
 * do prazo (`cc6-crit` / `cc6-warn`). Quem tem baixa visão de cor perde os
 * dois de uma vez. Sobra o texto — "há 2d" contra "em 6h" —, e a diferença
 * entre estar atrasado e estar no prazo passa a ser UMA preposição de duas
 * letras, em 11px, na quarta coluna de leitura. Numa fila de vinte linhas
 * ninguém lê vinte preposições.
 *
 * O glifo é o canal que faltava: forma reconhecível de relance, no mesmo
 * espaço, sobrevivendo em escala de cinza. É exatamente a troca que a sala de
 * comando fez nos alertas — lá o ponto de 6px saiu e o glifo entrou.
 *
 * ── Por que NÃO é "emoji em cada item" ─────────────────────────────────────
 * `taskSeverity` devolve `null` para tudo que está no futuro ou sem prazo, e
 * `STEP_SEV.planned` também. Essas linhas não recebem glifo nenhum. Numa fila
 * saudável a coluna fica vazia, e é essa ausência que faz a marca informar
 * quando aparece. O preço está declarado em `limites`: no recorte "Vencidas",
 * onde toda linha é vencida por construção, o glifo deixa de separar linhas
 * entre si — continua dizendo o estado, não mais a diferença.
 *
 * ── As duas formas, e por que estas ────────────────────────────────────────
 * ⚠️ é triângulo, ⏳ é ampulheta: silhuetas que não se confundem nem sem cor.
 * E ⚠️ já é, neste produto, a marca de risco alto no cartão do Kanban — um
 * vocabulário só, duas telas.
 *
 * `aria-hidden` porque o texto ao lado (`relativeDue`) e o `title` com a data
 * absoluta já dizem a mesma coisa em palavras. O leitor de tela não deve ouvir
 * "triângulo vermelho atenção há 2 dias".
 */
const SEV_GLIFO = { crit: "⚠️", warn: "⏳" } as const;

/* ── O CAMPO DO FORMULÁRIO É ILEGÍVEL NO TEMA CLARO, E O `bg-` DA CLASSE
      NUNCA TEVE NADA A VER COM ISSO ────────────────────────────────────────
   MEDIDO no navegador, com o CSS compilado de verdade, painel branco, tema
   claro: **contraste 1,59** entre o texto digitado e o fundo do campo. Quem
   escreve o título da tarefa no tema claro — que é onde o dono trabalha —
   escreve em cima do preto.

   A primeira correção que escrevi aqui foi trocar o `bg-` cravado por um
   `color-mix` do token. O navegador refutou: o campo continuou com
   `rgba(7,12,24,0.82)`, EXATAMENTE o mesmo valor de antes. O `bg-` novo era
   código morto — e o `bg-` cravado que ele substituiu também era, desde
   sempre. Ninguém veria isso lendo o `.tsx`.

   A cor real vem de `app/globals.css`:

       input, select, textarea {
         color: var(--atlas-text-primary);
         background: rgba(7, 12, 24, 0.82);
       }

   Seletor de ELEMENTO, sem camada. CSS sem camada vence `@layer utilities`,
   onde mora todo utilitário do Tailwind — então nenhuma classe de fundo neste
   arquivo jamais pintou este campo. É a mesma armadilha que este `globals.css`
   já documenta duas vezes, e o par outra vez decidido em lugares diferentes: a
   COR vira com o tema (é token), o FUNDO não (é literal escuro).

   A única saída a partir do `.tsx` é o `!`, que é a técnica sancionada neste
   repositório para vencer regra sem camada (o `PageHeader` já a usa). O `!`
   aqui não é atalho: é a marca de que existe uma regra global errada por baixo.

   ISTO CONSERTA UMA TELA, NÃO O DEFEITO. `input, select, textarea` pinta TODO
   campo do produto, e todos os outros continuam em 1,59 no tema claro. O
   conserto de verdade é uma sobrescrita de tema em `globals.css`, que esta
   entrega não pode tocar.

   ── E O `text-sm` DESTE CAMPO ERA A MESMA ARMADILHA, EM OUTRA PROPRIEDADE ──
   O mesmo `globals.css`, quarenta linhas ANTES da regra de cor:

       button, input, select, textarea { font: inherit; }

   `font` é o atalho: ele redefine `font-size` junto. Também sem camada, também
   vencendo `@layer utilities` — então `text-sm` nunca valeu 14px aqui. O campo
   herdava o tamanho do `<label>` que o embrulha, e o label pedia `text-xs`:
   **o campo renderizava 12px enquanto a classe anunciava 14**. Dois números,
   nenhum deles na escala do v3 (10 · 11 · 13 · 20 · 34), e o que estava escrito
   no `.tsx` não era o que a pessoa via — a mesma classe de defeito do `bg-`,
   descoberta pelo mesmo caminho: procurar quem MAIS decide a propriedade.

   Agora o par é declarado nos dois lugares e nos degraus certos: o rótulo é
   `text-rotulo` (11px — "rótulo de campo" é literalmente o papel do degrau) e o
   campo crava `text-corpo!` (13px — "o texto que se lê"). O `!` não é enfeite:
   sem ele o campo volta a herdar 11px do label, porque `font: inherit` continua
   mandando. Efeito medido no que a pessoa digita: 12px → 13px. */
const FIELD_CLASS =
  "mt-2 min-h-[44px] w-full rounded-xl border border-[color-mix(in_srgb,var(--atlas-texto-forte)_30%,transparent)]! bg-[color-mix(in_srgb,var(--atlas-texto-forte)_8%,transparent)]! px-3 py-2.5 text-corpo! text-[var(--atlas-texto-forte)]! outline-none transition-colors placeholder:text-[var(--atlas-texto-medio)] focus:border-[color:var(--atlas-accent)]! disabled:opacity-50";
const LABEL_CLASS = "text-rotulo text-[var(--atlas-texto-fraco)]";

/* A tinta de hover era `rgba(75,141,248,…)` — o acento ESCURO, literal. Sai por
   token com alfa, que é a única forma de a mesma receita servir aos dois temas. */
const HOVER_LINHA =
  "hover:bg-[color-mix(in_srgb,var(--atlas-accent)_6%,transparent)]";

/**
 * A FORMA da fila — a pergunta que o número sozinho não responde.
 *
 * "12 vencidas" não diz se o dia está perdido ou sob controle: 12 de 15 e 12 de
 * 120 são dois dias diferentes, e o mesmo número. A barra responde a proporção
 * de relance, que é exatamente o que um gráfico deve fazer aqui e nada mais —
 * por isso ela não repete contagem nenhuma: cada número vive uma única vez, no
 * controle que o filtra.
 *
 * A partição é exata por construção: vencida (prazo < agora), no prazo (tem
 * prazo e ainda não venceu) e sem prazo são disjuntas e cobrem a fila inteira,
 * então `noPrazo` sai por subtração sem risco de dupla contagem. "Hoje" ficou
 * FORA da barra de propósito: ela cruza com "vencidas" (uma tarefa marcada para
 * as 9h já venceu ao meio-dia e conta nas duas), e segmento que se sobrepõe não
 * é partição — seria uma segunda verdade sobre o mesmo total.
 */
const FAIXAS_DA_FILA = [
  { chave: "vencidas", rotulo: "vencidas", cor: "var(--atlas-estado-perigo)" },
  { chave: "noPrazo", rotulo: "no prazo", cor: "var(--atlas-accent)" },
  {
    chave: "semPrazo",
    rotulo: "sem prazo",
    cor: "color-mix(in srgb, var(--atlas-texto-fraco) 70%, transparent)",
  },
] as const;

type FormaDaFila = {
  total: number;
  vencidas: number;
  noPrazo: number;
  semPrazo: number;
};

function BarraDaFila({ forma }: { forma: FormaDaFila }) {
  /* O deslocamento de cada faixa é a soma das anteriores. Escrever isso como um
     acumulador `let` reatribuído dentro do `.map` reprova em
     `react-hooks/immutability` — o compilador do React não aceita ligação de
     fora sendo mutada durante o render, e `npm run lint` entra no `validate`.
     A soma de prefixo dá o MESMO número sem estado: três faixas, custo
     irrelevante, e o cálculo passa a ser lido de uma vez só. */
  const segmentos = FAIXAS_DA_FILA.map((faixa, indice) => {
    const valor = forma[faixa.chave];
    const inicio = FAIXAS_DA_FILA.slice(0, indice).reduce(
      (soma, anterior) => soma + forma[anterior.chave],
      0,
    );
    return {
      ...faixa,
      valor,
      x: (inicio / forma.total) * 100,
      largura: (valor / forma.total) * 100,
    };
  }).filter((segmento) => segmento.valor > 0);

  return (
    /* Barra e legenda dividem a linha: a legenda é curta e a barra não precisa
       da largura inteira para mostrar proporção. Uma linha em vez de duas. */
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <div className="min-w-[160px] flex-1 overflow-hidden rounded-full">
        <svg
          width="100%"
          height="6"
          className="block"
          role="img"
          aria-label={`Fila aberta com ${forma.total} tarefas: ${segmentos
            .map((segmento) => `${segmento.valor} ${segmento.rotulo}`)
            .join(", ")}.`}
        >
          <rect
            x="0"
            y="0"
            width="100%"
            height="6"
            fill="color-mix(in srgb, var(--atlas-texto-fraco) 22%, transparent)"
          />
          {segmentos.map((segmento) => (
            <rect
              key={segmento.chave}
              x={`${segmento.x}%`}
              y="0"
              width={`${segmento.largura}%`}
              height="6"
              fill={segmento.cor}
            />
          ))}
        </svg>
      </div>
      <p className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
        {segmentos.map((segmento) => (
          <span key={segmento.chave} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: segmento.cor }}
            />
            {segmento.rotulo}
          </span>
        ))}
      </p>
    </div>
  );
}

function dateLabel(value: string | null) {
  if (!value) return "Sem prazo";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Prazo indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

// Uma referência temporal por linha: relativa no texto, absoluta no title.
function relativeDue(value: string | null, nowMs: number) {
  if (!value) return "sem prazo";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "sem prazo";
  const diff = time - nowMs;
  const abs = Math.abs(diff);
  if (abs < 60_000) return "agora";
  const span =
    abs < 3_600_000
      ? `${Math.max(1, Math.round(abs / 60_000))}min`
      : abs < 86_400_000
        ? `${Math.round(abs / 3_600_000)}h`
        : `${Math.round(abs / 86_400_000)}d`;
  return diff < 0 ? `há ${span}` : `em ${span}`;
}

function taskSeverity(task: Task): "crit" | "warn" | null {
  if (task.overdue) return "crit";
  if (task.today) return "warn";
  return null;
}

/**
 * A TINTA DA SEVERIDADE — e por que ela não pode mais sair de `.cc6-crit`.
 *
 * MEDIDO no navegador em 02/08/2026, com o CSS compilado do produto, tema
 * CLARO (que é onde o dono trabalha), num elemento que carrega `cc6-num`:
 *
 *     cc6-num + cc6-crit .......... rgb(180, 83, 9)
 *     cc6-num + cc6-warn .......... rgb(180, 83, 9)
 *     cc6-num sozinho ............. rgb(180, 83, 9)
 *
 * As TRÊS situações — vencida, para hoje e no futuro — saem exatamente da
 * mesma cor. A causa é `:root[data-theme="light"] .cc6-num:not(.atlas-leads-table-panel *)`
 * em `app/globals.css`: regra SEM camada, especificidade (0,4,0), declarada
 * DEPOIS de `:root[data-theme="light"] .cc6-num.cc6-crit`, que vale (0,4,0)
 * também. Empate resolvido pela ordem, e o genérico âmbar vence o semântico.
 *
 * Duas consequências, e a segunda é pior que a primeira:
 *   1. no tema claro a cor deixa de separar vencida de hoje;
 *   2. uma tarefa NEUTRA — "em 3d", nenhuma urgência — é pintada de âmbar,
 *      que neste produto é a cor de atenção. A tela alarma sobre algo que
 *      está em dia.
 *
 * A saída a partir do `.tsx` é apontar direto para o token de estado com `!`,
 * exatamente como `/activity` já faz e documenta. `!` aqui não é preferência:
 * é a marca de que existe uma regra global decidindo por baixo.
 *
 * NO TEMA ESCURO A TROCA É UM NÃO-EVENTO, e isso foi medido: `.cc6-crit` e
 * `text-[var(--atlas-estado-perigo)]!` dão o MESMO rgb(251,113,133); `.cc6-warn`
 * e o token de atenção dão o mesmo rgb(245,181,68). Só o claro muda — que é
 * onde estava errado.
 *
 * O caso nulo devolve a tinta fraca em vez de string vazia: sem classe, quem
 * pintava era o `.cc6-num` âmbar, não o parágrafo pai. Devolver o token é
 * restaurar a intenção que já estava escrita no pai.
 */
function sevTextClass(sev: "crit" | "warn" | null) {
  return sev === "crit"
    ? "text-[var(--atlas-estado-perigo)]!"
    : sev === "warn"
      ? "text-[var(--atlas-estado-atencao)]!"
      : "text-[var(--atlas-texto-fraco)]!";
}

export default function TasksPage() {
  const [data, setData] = useState<Center | null>(null);
  const [assistant, setAssistant] = useState<DailyAssistant | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [view, setView] = useState<View>("priority");
  const [form, setForm] = useState(EMPTY_FORM);
  const [nowMs, setNowMs] = useState(0);
  const [focarCriacao, setFocarCriacao] = useState(false);

  // Relógio de 1min: mantém "há 2d"/"em 3h" frescos sem tocar nos fetches.
  useEffect(() => {
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  /**
   * A intenção que vem na URL — sem ela o botão "Nova tarefa" mentia.
   *
   * `lib/atlas/navigation.ts` declara a ação primária deste destino como
   * `/tasks?create=1`, prometendo "agendar uma ação comercial rastreável". Só
   * que a tela nunca leu o parâmetro: quem clicava em "Nova tarefa" chegava
   * aqui com a fila aberta e o formulário fechado, e ainda tinha que procurar
   * o botão para fazer o que já havia pedido. A promessa era decorativa, e não
   * aparecia em teste nenhum porque a tela ABRE — só não faz o que o botão diz.
   *
   * Não reabrimos caminho novo: `showCreate` é o mesmo estado que o botão da
   * fila alterna, então link e clique desembocam no mesmo painel.
   *
   * A leitura vem do módulo compartilhado, e não de um `URLSearchParams` local,
   * porque nove telas repetindo a mesma regra é exatamente a classe de defeito
   * que este repositório mais pagou. Parâmetro ausente, `create` com outro
   * valor ou URL malformada devolvem `null` lá dentro e esta tela abre como
   * sempre abriu — intenção não reconhecida nunca vira recorte silencioso.
   *
   * `window.location.search` em vez de `useSearchParams` pelo mesmo motivo de
   * `/leads`: o hook exigiria fronteira <Suspense> nesta página cliente inteira
   * por causa de um parâmetro, e o efeito de montagem já tem a semântica certa
   * — a URL define o estado inicial, a pessoa assume a partir daí.
   */
  useEffect(() => {
    if (!pedeCriar(lerIntencaoDaJanela())) return;
    setShowCreate(true);
    setFocarCriacao(true);
  }, []);

  /**
   * Formulário aberto fora da vista é o mesmo que formulário fechado: o painel
   * de criação fica abaixo do assistente diário e, em tela curta, quem chegou
   * pelo link veria a fila de sempre e concluiria que o botão não funcionou.
   * Trazer o primeiro campo à vista e dar foco nele mostra o estado e já deixa
   * a pessoa digitando. Roda só na abertura por link — o clique no botão da
   * fila continua sem roubar o foco de quem estava lendo a lista.
   */
  useEffect(() => {
    if (!focarCriacao) return;
    setFocarCriacao(false);
    const campo = document.getElementById("task-title");
    if (!(campo instanceof HTMLInputElement)) return;
    campo.scrollIntoView({ block: "center", behavior: "smooth" });
    campo.focus({ preventScroll: true });
  }, [focarCriacao]);

  const sessionToken = useCallback(async () => {
    const { data: session } = await supabase.auth.getSession();
    return session.session?.access_token || "";
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = { Authorization: `Bearer ${await sessionToken()}` };
      const [response, daily] = await Promise.all([
        fetch("/api/v1/tasks", { headers, cache: "no-store" }),
        fetch("/api/v1/productivity/daily", { headers, cache: "no-store" }),
      ]);
      const body = await response.json();
      const dailyBody = await daily.json();
      if (!response.ok) throw new Error(body.error?.message || body.error);
      setData(body.data || body);
      setAssistant(daily.ok ? dailyBody.data || dailyBody : null);
    } catch {
      setError("Não foi possível carregar sua operação diária.");
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(
    task: Task,
    action: "complete" | "postpone_one_day" | "cancel_recurrence",
  ) {
    setSavingId(task.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/v1/tasks", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await sessionToken()}`,
        },
        body: JSON.stringify({ id: task.id, action }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || body.error);
      setMessage(
        action === "complete"
          ? "Tarefa concluída. O histórico foi preservado."
          : action === "cancel_recurrence"
            ? "Repetição encerrada. As tarefas já criadas foram preservadas."
            : "Tarefa reagendada por um dia.",
      );
      await load();
    } catch {
      setError(
        action === "complete"
          ? "Não foi possível concluir a tarefa."
          : action === "cancel_recurrence"
            ? "Não foi possível encerrar a repetição."
            : "Não foi possível reagendar a tarefa.",
      );
    } finally {
      setSavingId(null);
    }
  }

  async function createTask() {
    setCreating(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/v1/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await sessionToken()}`,
        },
        body: JSON.stringify({
          ...form,
          dueAt: new Date(form.dueAt).toISOString(),
          endsAt: form.endsAt
            ? new Date(`${form.endsAt}T23:59:59`).toISOString()
            : null,
          assigneeId:
            form.assigneeId || data?.creationOptions.defaults.assigneeId,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || body.error);
      setForm(EMPTY_FORM);
      setShowCreate(false);
      setMessage(
        form.cadence
          ? "Tarefa recorrente criada com término e limite definidos."
          : "Tarefa criada e adicionada à fila.",
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível criar a tarefa.",
      );
    } finally {
      setCreating(false);
    }
  }

  const visible = useMemo(
    () =>
      data?.tasks.filter((task) =>
        view === "overdue"
          ? task.overdue
          : view === "today"
            ? task.today
            : view === "unassigned"
              ? !task.assigned_to
              : view === "high"
                ? HIGH_PRIORITY.has(task.priority)
                : view === "mine"
                  ? task.mine
                  : view === "team"
                    ? !task.mine
                    : view === "no_due"
                      ? !task.due_at
                      : true,
      ) ?? [],
    [data, view],
  );

  /* Os dois recortes novos saem do MESMO predicado que a rota usa para contar
     (`!assigned_to` e o conjunto de alta prioridade). Contar por um caminho e
     filtrar por outro é como a lista fica vazia com o chip marcando 3. */
  const viewCounts = useMemo(
    () => ({
      priority: data?.summary.open ?? 0,
      overdue: data?.summary.overdue ?? 0,
      today: data?.summary.today ?? 0,
      unassigned: data?.summary.unassigned ?? 0,
      high: data?.summary.high ?? 0,
      mine: data?.summary.mine ?? 0,
      team: data?.tasks.filter((task) => !task.mine).length ?? 0,
      no_due: data?.summary.withoutDueDate ?? 0,
    }),
    [data],
  );

  const formaDaFila = useMemo<FormaDaFila | null>(() => {
    if (!data || data.summary.open <= 0) return null;
    const total = data.summary.open;
    const vencidas = data.summary.overdue;
    const semPrazo = data.summary.withoutDueDate;
    return {
      total,
      vencidas,
      semPrazo,
      noPrazo: Math.max(0, total - vencidas - semPrazo),
    };
  }, [data]);

  // Uma tarefa-semente por recorrência ativa (mesma dedupe da versão anterior).
  const recurrenceSeeds = useMemo(() => {
    const seen = new Set<string>();
    return (data?.tasks ?? []).filter((task) => {
      if (!task.recurrence_id || seen.has(task.recurrence_id)) return false;
      seen.add(task.recurrence_id);
      return true;
    });
  }, [data]);

  const leadership = Boolean(
    data &&
      ["admin", "director", "superintendent", "manager"].includes(
        data.scope.role,
      ),
  );
  const primarySteps = assistant?.sequence.slice(0, 3) ?? [];
  const remainingSteps = assistant?.sequence.slice(3) ?? [];

  return (
    <div
      className="space-y-4 pb-8"
      data-phase="38-task-execution-workspace"
      data-task-layout="execution-first"
    >
      {/* A descrição dizia "em rosa" — o rosa era o literal cravado da faixa,
          que só existe no tema escuro. Com a faixa saindo do token, no claro
          ela é vermelha, e o texto tinha de acompanhar. */}
      <PageHeader
        eyebrow="Central de tarefas · Execução diária"
        title="O que precisa ser feito agora"
        description="Vencidas em vermelho, combinados de hoje em âmbar — decida e execute na ordem."
        action={{
          href: "/calendar",
          label: "Abrir agenda",
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
      {message ? (
        <div
          className="cc6-panel-quiet cc6-ok px-4 py-3 text-corpo leading-5"
          role="status"
          aria-live="polite"
        >
          {message}
        </div>
      ) : null}

      <section data-phase="48-daily-productivity" aria-labelledby="atlas-daily-focus">
        <TiltShell className="cc6-panel cc6-reveal overflow-hidden" delayMs={40}>
          {/* Eyebrow e título passam a dividir a MESMA linha de base: eram duas
              linhas empilhadas para dizer uma coisa só, e essa é a altura que
              a dobra estava pagando duas vezes na página (aqui e na fila). */}
          <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pt-4 pb-1">
            <h2
              id="atlas-daily-focus"
              className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-corpo font-semibold tracking-tight text-[var(--atlas-texto-forte)]"
            >
              <span className="cc6-eyebrow">Assistente diário</span>
              <span>Comece por aqui</span>
            </h2>
            {/* `summary` vinha na resposta e a tela jogava fora — o roteiro
                mostrava três passos sem dizer quantos existem nem de que
                urgência. É o contexto que faltava aos ordinais. O escopo vem
                escrito ("roteiro"): são os até 7 passos da sequência, entre
                tarefas, leads e visitas, e não a fila de tarefas abaixo. */}
            {assistant ? (
              <p className="cc6-num shrink-0 text-rotulo text-[var(--atlas-texto-fraco)]!">
                roteiro de {assistant.summary.steps}
                {assistant.summary.now ? (
                  <>
                    {" · "}
                    <span className="cc6-crit font-semibold">
                      {assistant.summary.now} agora
                    </span>
                  </>
                ) : null}
                {assistant.summary.today ? (
                  <>
                    {" · "}
                    <span className="cc6-warn font-semibold">
                      {assistant.summary.today} hoje
                    </span>
                  </>
                ) : null}
                {assistant.summary.planned
                  ? ` · ${assistant.summary.planned} planejadas`
                  : ""}
              </p>
            ) : null}
          </header>
          <div
            className="mt-1 flex flex-col"
            aria-live="polite"
            aria-busy={loading}
          >
            {loading ? (
              <div className="space-y-2 px-5 pb-5">
                {[1, 2, 3].map((item) => (
                  <AtlasSkeleton key={item} className="h-14" />
                ))}
              </div>
            ) : !assistant ? (
              /* ── ZERO PARECIA SAUDÁVEL ────────────────────────────────────
                 `setAssistant(daily.ok ? … : null)`: quando a rota do roteiro
                 falhava, `assistant` virava nulo, `primarySteps` virava lista
                 vazia — e a tela dizia "Dia sob controle · Nenhuma prioridade
                 pessoal exige ação neste momento". Uma rota caída era
                 apresentada ao corretor como um dia resolvido.

                 É o precedente do `usageCost`: zero parece saudável, nulo diz a
                 verdade. Agora nulo tem tela própria, com o que falta escrito e
                 o caminho de volta. */
              <div className="cc6-hairline flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <p className="min-w-0 flex-1 text-corpo leading-5 text-[var(--atlas-texto-medio)]">
                  <strong className="cc6-warn font-semibold">Sem lastro.</strong>{" "}
                  O roteiro do dia não respondeu — nenhuma ordem foi calculada, e
                  isto não quer dizer que não haja o que fazer. A fila comercial
                  abaixo continua válida.
                </p>
                <button
                  type="button"
                  onClick={() => void load()}
                  disabled={loading}
                  className="cc6-ghost-btn shrink-0 disabled:opacity-50"
                >
                  Recalcular roteiro
                </button>
              </div>
            ) : primarySteps.length ? (
              primarySteps.map((step, index) => {
                const sev = STEP_SEV[step.urgency];
                return (
                  <Link
                    key={`${step.kind}-${step.id}`}
                    href={step.href}
                    className={`cc6-reveal group flex items-start gap-3 px-5 py-3 transition-colors ${HOVER_LINHA} ${index ? "cc6-hairline" : ""} ${sev ? "cc6-sev-band" : ""}`}
                    style={
                      {
                        animationDelay: `${100 + index * 60}ms`,
                        ...(sev ? { "--cc6-sev": SEV_INK[sev] } : {}),
                      } as CSSProperties
                    }
                    data-urgency={step.urgency}
                  >
                    {/* O ordinal desceu de 20px para rótulo: ele ordena, não se
                        compara com nada. Os 20px pertencem ao número que decide,
                        e ele está na faixa de decisão da fila. */}
                    <span
                      className="cc6-num w-4 shrink-0 text-rotulo leading-5 text-[var(--atlas-texto-fraco)]!"
                      aria-hidden="true"
                    >
                      {step.position}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        {/* Sem `truncate`: título de passo é frase, e frase
                            cortada com reticências não é frase legível. */}
                        <strong className="text-corpo font-medium leading-5 text-[var(--atlas-texto-forte)]">
                          {step.title}
                        </strong>
                        <span className="cc6-eyebrow text-micro!">
                          {KIND_LABEL[step.kind]}
                        </span>
                        {step.dueAt ? (
                          <span
                            className={`cc6-num inline-flex items-baseline gap-1 text-rotulo ${sevTextClass(sev)}`}
                            title={dateLabel(step.dueAt)}
                          >
                            {sev ? (
                              <span aria-hidden="true">{SEV_GLIFO[sev]}</span>
                            ) : null}
                            {relativeDue(step.dueAt, nowMs)}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
                        {step.reason}
                      </span>
                    </span>
                    <span className="shrink-0 text-rotulo font-medium leading-5 text-[var(--atlas-texto-medio)] transition-colors group-hover:text-[color:var(--atlas-accent)]">
                      {step.action} <span aria-hidden="true">→</span>
                    </span>
                  </Link>
                );
              })
            ) : (
              <div className="px-5 pb-5 pt-1">
                <AtlasEmpty
                  reason="completed"
                  eyebrow="Prioridades concluídas"
                  title="Dia sob controle"
                  description="Nenhuma prioridade pessoal exige ação neste momento."
                  action={
                    <Link href="/calendar" className="atlas-button-secondary">
                      Revisar agenda
                    </Link>
                  }
                />
              </div>
            )}
          </div>
          {remainingSteps.length ? (
            <details className="cc6-hairline px-5 py-2.5">
              {/* Eram "+N planejadas", e o rótulo mentia: estes são os passos 4
                  em diante da sequência, de QUALQUER urgência — o passo 4 pode
                  ser um follow-up vencido. "Planejadas" tem dono: é
                  `summary.planned`, que agora aparece no cabeçalho com o
                  significado certo. */}
              <summary className="cc6-eyebrow cursor-pointer list-none text-micro! transition-colors hover:text-[var(--atlas-texto-medio)]">
                +{remainingSteps.length} passos restantes do roteiro
              </summary>
              <div className="mt-2 flex flex-col gap-1.5">
                {remainingSteps.map((step) => (
                  <Link
                    key={`${step.kind}-${step.id}`}
                    href={step.href}
                    className="flex items-baseline gap-2 text-rotulo leading-4 text-[var(--atlas-texto-medio)] transition-colors hover:text-[var(--atlas-texto-forte)]"
                  >
                    <span className="cc6-num shrink-0 text-[var(--atlas-texto-fraco)]!">
                      {step.position}
                    </span>
                    <span className="min-w-0 flex-1">{step.title}</span>
                    <span className="shrink-0 text-[var(--atlas-texto-fraco)]">
                      {step.action}
                    </span>
                  </Link>
                ))}
              </div>
            </details>
          ) : null}
        </TiltShell>
      </section>

      {showCreate ? (
        <div id="atlas-task-create" data-phase="42-task-quick-create">
          <section
            className="cc6-panel cc6-reveal overflow-hidden"
            aria-labelledby="atlas-task-create-title"
          >
            <header className="px-5 pt-4 pb-3">
              <h2
                id="atlas-task-create-title"
                className="flex flex-wrap items-baseline gap-x-2 text-corpo font-semibold tracking-tight text-[var(--atlas-texto-forte)]"
              >
                <span className="cc6-eyebrow">
                  Nova tarefa · Recorrência opcional
                </span>
                <span>Criar em poucos segundos</span>
              </h2>
            </header>
            <form
              className="cc6-hairline p-5"
              onSubmit={(event) => {
                event.preventDefault();
                void createTask();
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label
                  className={`${LABEL_CLASS} sm:col-span-2`}
                  htmlFor="task-title"
                >
                  Título
                  <input
                    id="task-title"
                    value={form.title}
                    maxLength={120}
                    required
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    className={FIELD_CLASS}
                    placeholder="Ex.: Confirmar visita ao empreendimento"
                  />
                </label>
                <label className={LABEL_CLASS} htmlFor="task-due-at">
                  Prazo
                  <input
                    id="task-due-at"
                    type="datetime-local"
                    value={form.dueAt}
                    required
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        dueAt: event.target.value,
                      }))
                    }
                    className={FIELD_CLASS}
                  />
                </label>
                <label className={LABEL_CLASS} htmlFor="task-priority">
                  Prioridade
                  <select
                    id="task-priority"
                    value={form.priority}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        priority: event.target.value,
                      }))
                    }
                    className={FIELD_CLASS}
                  >
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                  </select>
                </label>
              </div>

              <details className="mt-4">
                <summary className="cc6-eyebrow cursor-pointer list-none text-micro! transition-colors hover:text-[var(--atlas-texto-medio)]">
                  Adicionar vínculo, descrição ou repetição
                </summary>
                <div className="grid gap-4 pt-4 sm:grid-cols-2">
                  <label
                    className={`${LABEL_CLASS} sm:col-span-2`}
                    htmlFor="task-description"
                  >
                    Descrição opcional
                    <textarea
                      id="task-description"
                      value={form.description}
                      maxLength={2000}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      rows={3}
                      className={FIELD_CLASS}
                    />
                  </label>
                  <label className={LABEL_CLASS} htmlFor="task-lead">
                    Lead opcional
                    <select
                      id="task-lead"
                      value={form.leadId}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          leadId: event.target.value,
                        }))
                      }
                      className={FIELD_CLASS}
                    >
                      <option value="">Sem lead vinculada</option>
                      {data?.creationOptions.leads.map((lead) => (
                        <option key={lead.id} value={lead.id}>
                          {lead.name || "Lead sem nome"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={LABEL_CLASS} htmlFor="task-assignee">
                    Responsável
                    <select
                      id="task-assignee"
                      disabled={Boolean(form.leadId)}
                      value={
                        form.assigneeId ||
                        data?.creationOptions.defaults.assigneeId ||
                        ""
                      }
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          assigneeId: event.target.value,
                        }))
                      }
                      className={FIELD_CLASS}
                    >
                      {data?.creationOptions.assignees.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.full_name || "Profissional sem nome"}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-micro text-[var(--atlas-texto-fraco)]">
                      {form.leadId
                        ? "Definido pelo corretor único da lead."
                        : "Somente profissionais visíveis no seu escopo."}
                    </span>
                  </label>
                  <label className={LABEL_CLASS} htmlFor="task-cadence">
                    Repetir tarefa
                    <select
                      id="task-cadence"
                      value={form.cadence}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          cadence: event.target.value,
                        }))
                      }
                      className={FIELD_CLASS}
                    >
                      <option value="">Não repetir</option>
                      <option value="daily">Todos os dias</option>
                      <option value="weekly">Toda semana</option>
                      <option value="monthly">Todo mês</option>
                    </select>
                  </label>
                  {form.cadence ? (
                    <>
                      <label className={LABEL_CLASS} htmlFor="task-ends-at">
                        Encerrar em
                        <input
                          id="task-ends-at"
                          type="date"
                          value={form.endsAt}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              endsAt: event.target.value,
                            }))
                          }
                          className={FIELD_CLASS}
                        />
                      </label>
                      <label
                        className={LABEL_CLASS}
                        htmlFor="task-max-occurrences"
                      >
                        Máximo de ocorrências
                        <input
                          id="task-max-occurrences"
                          type="number"
                          min={2}
                          max={100}
                          value={form.maxOccurrences}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              maxOccurrences: Number(event.target.value),
                            }))
                          }
                          className={FIELD_CLASS}
                        />
                      </label>
                      <p className="cc6-panel-quiet self-end p-3 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
                        A recorrência encerra na primeira condição atingida:
                        data final ou limite.
                      </p>
                    </>
                  ) : null}
                </div>
              </details>

              <div className="mt-5 flex justify-end">
                <button
                  type="submit"
                  disabled={
                    creating ||
                    form.title.trim().length < 3 ||
                    !form.dueAt ||
                    Boolean(
                      form.cadence &&
                        (!form.endsAt ||
                          form.maxOccurrences < 2 ||
                          form.maxOccurrences > 100),
                    )
                  }
                  className="atlas-button-primary disabled:opacity-50"
                >
                  {creating
                    ? "Criando..."
                    : form.cadence
                      ? "Criar recorrência"
                      : "Criar tarefa"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <div
        className={`grid gap-4 ${leadership ? "xl:grid-cols-[minmax(0,1fr)_320px]" : ""}`}
      >
        <section
          className="cc6-panel cc6-reveal self-start overflow-hidden"
          style={{ animationDelay: "180ms" }}
          aria-labelledby="atlas-task-queue-title"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 px-5 pt-4">
            <h2
              id="atlas-task-queue-title"
              className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-corpo font-semibold tracking-tight text-[var(--atlas-texto-forte)]"
            >
              <span className="cc6-eyebrow">Fila comercial</span>
              <span>Priorizada por atraso e prazo</span>
            </h2>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void load()}
                className="cc6-ghost-btn disabled:opacity-50"
                disabled={loading}
              >
                {loading ? "Atualizando..." : "Atualizar"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate((current) => !current)}
                className="atlas-button-primary"
                aria-expanded={showCreate}
                aria-controls="atlas-task-create"
              >
                {showCreate ? "Fechar criação" : "Nova tarefa"}
              </button>
            </div>
          </header>

          {/* ── A FAIXA DE DECISÃO ───────────────────────────────────────────
              Os mesmos recortes de antes, no tamanho da consequência de cada
              um, e coladas na lista que elas filtram. Cada contagem aparece uma
              única vez, no controle que a aciona: o herói É o filtro de
              vencidas, e por isso não existe também um chip "Vencidas 12" — dois
              lugares dizendo o mesmo número é o ruído que o dono pediu para
              tirar. A barra logo abaixo não repete número nenhum: ela só
              responde a proporção. */}
          <div className="mt-3 px-5 pb-3">
            {loading ? (
              <AtlasSkeleton className="h-14" />
            ) : !data ? (
              <p className="text-corpo leading-5 text-[var(--atlas-texto-medio)]">
                <strong className="cc6-warn font-semibold">Sem lastro.</strong> A
                fila não respondeu — nenhum recorte pode ser contado. Use
                &ldquo;Atualizar&rdquo; para tentar de novo.
              </p>
            ) : (
              <>
                <div
                  role="tablist"
                  aria-label="Filtrar tarefas"
                  className="flex flex-wrap items-end gap-x-6 gap-y-3"
                >
                  {TASK_VIEWS.filter(([key]) => VIEW_TIER[key] !== "chip").map(
                    ([key, label]) => {
                      const active = view === key;
                      const count = viewCounts[key];
                      const ink = count ? (VIEW_INK[key] ?? "") : "";
                      return (
                        <button
                          key={key}
                          id={`task-view-${key}-tab`}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          aria-controls="task-view-panel"
                          onClick={() => setView(key)}
                          className={`flex min-h-[44px] cursor-pointer flex-col items-start justify-end border-b-2 pb-1 text-left transition-colors ${
                            active
                              ? "border-b-[color:var(--atlas-accent)]"
                              : "border-b-transparent hover:border-b-[color-mix(in_srgb,var(--atlas-texto-forte)_28%,transparent)]"
                          }`}
                        >
                          <span
                            className={`cc6-metric-value leading-none ${VIEW_TIER[key] === "heroi" ? "text-heroi" : "text-numero"} ${ink}`}
                          >
                            {count}
                          </span>
                          <span className="cc6-eyebrow mt-1.5 text-micro!">
                            {label}
                          </span>
                        </button>
                      );
                    },
                  )}
                  {/* Os chips dividem a linha com os números em vez de forçar
                      uma segunda: em tela larga a faixa inteira cabe numa
                      altura só, e em tela estreita eles descem sozinhos. */}
                  <div
                    role="presentation"
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5"
                  >
                    {TASK_VIEWS.filter(([key]) => VIEW_TIER[key] === "chip").map(
                      ([key, label]) => {
                        const active = view === key;
                        const count = viewCounts[key];
                        return (
                          <button
                            key={key}
                            id={`task-view-${key}-tab`}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            aria-controls="task-view-panel"
                            onClick={() => setView(key)}
                            className={`cc6-chip cursor-pointer transition-colors ${
                              active
                                ? "cc6-destaque text-[var(--atlas-texto-forte)]!"
                                : "cc6-interativo hover:text-[var(--atlas-texto-forte)]!"
                            }`}
                          >
                            {label}
                            <strong className="font-semibold">{count}</strong>
                          </button>
                        );
                      },
                    )}
                  </div>
                </div>
                {formaDaFila ? <BarraDaFila forma={formaDaFila} /> : null}
              </>
            )}
          </div>
          <div
            id="task-view-panel"
            className="flex flex-col focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--atlas-accent)]"
            role="tabpanel"
            /* A aba é a etiqueta do painel, mas ela não existe enquanto a fila
               carrega nem quando ela não responde — e `aria-labelledby` que
               aponta para elemento inexistente deixa o painel sem nome nenhum.
               O `aria-label` é o piso: quando a aba existe, ela vence. */
            aria-labelledby={`task-view-${view}-tab`}
            aria-label="Tarefas do recorte selecionado"
            tabIndex={0}
            aria-live="polite"
            aria-busy={loading}
          >
            {loading ? (
              <div className="space-y-2 px-5 pb-5">
                {[1, 2, 3, 4].map((item) => (
                  <AtlasSkeleton key={item} className="h-12" />
                ))}
              </div>
            ) : visible.length ? (
              visible.map((task, index) => {
                const busy = savingId === task.id;
                const sev = taskSeverity(task);
                return (
                  <article
                    key={task.id}
                    className={`cc6-reveal cc6-hairline group relative flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 transition-colors ${HOVER_LINHA} ${sev ? "cc6-sev-band" : ""}`}
                    style={
                      {
                        animationDelay: `${Math.min(index, 8) * 45}ms`,
                        ...(sev ? { "--cc6-sev": SEV_INK[sev] } : {}),
                      } as CSSProperties
                    }
                    aria-busy={busy}
                    data-urgency={
                      task.overdue
                        ? "overdue"
                        : task.today
                          ? "today"
                          : task.due_at
                            ? "planned"
                            : "no-due"
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Título e descrição de tarefa são FRASE. Cortá-las com
                            reticências economiza pixel e destrói o conteúdo:
                            "Confirmar visita ao empreendi…" não diz qual. Quem
                            precisa caber é o gesto, não o texto. */}
                        <h3 className="min-w-0 text-corpo font-medium leading-5 text-[var(--atlas-texto-forte)]">
                          {task.title}
                        </h3>
                        {HIGH_PRIORITY.has(task.priority) ? (
                          <StatusBadge tone="warning">Alta</StatusBadge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
                        {/* O glifo fica DENTRO do mesmo span do prazo, e não
                            solto na linha: ele qualifica aquele prazo, e um
                            `gap-x-2` de distância o faria parecer um item de
                            metadado próprio, do mesmo nível do nome da lead. */}
                        <span
                          className={`cc6-num inline-flex items-baseline gap-1 ${sevTextClass(sev)}`}
                          title={dateLabel(task.due_at)}
                        >
                          {sev ? (
                            <span aria-hidden="true">{SEV_GLIFO[sev]}</span>
                          ) : null}
                          {relativeDue(task.due_at, nowMs)}
                        </span>
                        {task.lead_id ? (
                          <Link
                            href={`/leads/${task.lead_id}`}
                            className="max-w-full truncate font-medium text-[color:var(--atlas-accent)] hover:underline"
                          >
                            {task.lead?.name || "Abrir lead"}
                          </Link>
                        ) : null}
                        {!task.mine ? (
                          <span className="max-w-full truncate">
                            {task.assigneeName}
                          </span>
                        ) : null}
                      </p>
                      {task.description ? (
                        <p className="mt-0.5 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
                          {task.description}
                        </p>
                      ) : null}
                    </div>
                    {/* ── OS DOIS BOTÕES DA TELA SUMIAM NO TABLET ──────────
                        Eram `sm:opacity-0 … sm:group-hover:opacity-100`, e
                        `sm:` é LARGURA (min-width 640px), não é mouse. Num iPad
                        — 768px em pé, 1024px deitado — a condição de largura
                        bate, o hover nunca acontece, e "Concluir" e "+1 dia"
                        ficam em opacidade 0 para sempre. Continuam clicáveis
                        (opacidade não tira o toque), então o corretor tem de
                        acertar um botão que não vê: é o mesmo defeito de
                        "não consigo" que na verdade era "não enxergo".

                        O predicado certo é a CAPACIDADE, não o tamanho:
                        `(hover: hover)` só é verdade onde existe ponteiro que
                        paira. Telefone e tablet passam a mostrar os botões
                        sempre; no desktop nada muda — some até o hover, como
                        antes. E o custo de dobra é zero: `opacity` não altera o
                        fluxo, a linha já reservava essa largura nos dois casos.

                        Compilação verificada com o Tailwind 4.3.2 deste repo:
                        a variante empilha com `group-hover`/`group-focus-within`
                        e emite `@media (hover:hover)` de verdade. */}
                    <div className="flex shrink-0 gap-2 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:transition-opacity [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act(task, "postpone_one_day")}
                        className="cc6-ghost-btn disabled:opacity-50"
                        title="Reagendar para amanhã"
                        aria-label={`Reagendar ${task.title} em um dia`}
                      >
                        +1 dia
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act(task, "complete")}
                        className="cc6-ghost-btn disabled:opacity-50"
                        aria-label={`Concluir ${task.title}`}
                      >
                        {busy ? "Salvando..." : "Concluir"}
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="cc6-hairline px-5 py-6">
                <AtlasEmpty
                  reason={data?.tasks.length ? "no-results" : "completed"}
                  eyebrow={
                    data?.tasks.length
                      ? "Filtro sem pendências"
                      : "Rotina concluída"
                  }
                  title="Fila em dia"
                  description={
                    data?.tasks.length
                      ? "Nenhuma tarefa corresponde a este filtro. Volte às prioridades para revisar a fila completa."
                      : "Nenhuma tarefa aberta exige ação neste momento."
                  }
                  action={
                    data?.tasks.length ? (
                      <button
                        type="button"
                        onClick={() => setView("priority")}
                        className="atlas-button-secondary"
                      >
                        Ver prioridades
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowCreate(true)}
                        className="atlas-button-primary"
                      >
                        Criar tarefa
                      </button>
                    )
                  }
                />
              </div>
            )}
          </div>
          {/* ── A GAVETA DE AUDITORIA ────────────────────────────────────────
              O rodapé misturava decisão com auditoria em três chips iguais:
              "alta prioridade" e "sem responsável" eram recortes que ninguém
              podia clicar — subiram para a faixa de decisão e viraram filtro.
              O que sobra aqui é o que audita, e auditoria fica recolhida.

              "concluídas" ganhou o rótulo que sempre lhe faltou: a rota conta
              TODAS as tarefas encerradas nas até 2.000 linhas que leu, sem
              recorte de data nenhum. Não é "hoje" nem "na semana" — e um número
              sem janela é um número sem contexto. Agora ele diz o que é.

              O selo de custo parou de ser literal no JSX e passa a ler
              `method.llmCost`: se o custo deixar de ser zero, o selo muda com
              ele em vez de mentir. Sem resposta, ele diz "sem lastro" — nunca
              "zero", que é a leitura que parece saudável. */}
          {data || assistant ? (
            <details className="cc6-hairline px-5 py-2.5">
              <summary
                className="cc6-eyebrow cursor-pointer list-none text-micro! transition-colors hover:text-[var(--atlas-texto-medio)]"
                aria-label="Auditoria da rotina e do método de ordenação"
              >
                Auditoria · método da ordem e indicadores da rotina
              </summary>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {data ? (
                  <span className="cc6-chip">
                    concluídas · acumulado da carteira visível, sem recorte de
                    data{" "}
                    <strong className="cc6-ok font-semibold">
                      {data.summary.completed}
                    </strong>
                  </span>
                ) : null}
                {assistant ? (
                  assistant.method.llmCost === 0 ? (
                    <StatusBadge tone="success">Custo IA zero</StatusBadge>
                  ) : (
                    <StatusBadge tone="warning">
                      Custo IA {assistant.method.llmCost}
                    </StatusBadge>
                  )
                ) : (
                  <StatusBadge tone="warning">
                    Custo IA sem lastro · roteiro não respondeu
                  </StatusBadge>
                )}
                {assistant?.method.explainable ? (
                  <span className="cc6-chip">ordem explicável</span>
                ) : null}
                {assistant?.method.humanDecisionRequired ? (
                  <span className="cc6-chip">decisão sempre humana</span>
                ) : null}
              </div>
              <p className="mt-2 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
                Ordem explicável por contato, follow-up, prazo, visita,
                prioridade, temperatura e score · sem ranking de pessoas · sem
                execução automática.
              </p>
            </details>
          ) : null}
        </section>

        {leadership ? (
          <section
            className="cc6-panel-quiet cc6-reveal h-fit p-4"
            style={{ animationDelay: "240ms" }}
            aria-labelledby="atlas-team-load-title"
          >
            <h2
              id="atlas-team-load-title"
              className="flex flex-wrap items-baseline gap-x-2 text-corpo font-semibold tracking-tight text-[var(--atlas-texto-forte)]"
            >
              <span className="cc6-eyebrow">Equipe visível</span>
              <span>Carga por responsável</span>
            </h2>
            <div className="mt-2 flex flex-col">
              {data?.byOwner.map((owner, index) => (
                <div
                  key={owner.id}
                  className={`flex items-baseline justify-between gap-3 py-2 ${index ? "cc6-hairline" : ""}`}
                >
                  <span className="min-w-0 truncate text-corpo font-medium text-[var(--atlas-texto-forte)]">
                    {owner.name}
                  </span>
                  <span className="cc6-num shrink-0 text-rotulo text-[var(--atlas-texto-fraco)]!">
                    {owner.overdue ? (
                      <>
                        <span className="cc6-crit font-semibold">
                          {owner.overdue} vencidas
                        </span>
                        {" · "}
                      </>
                    ) : null}
                    {owner.open} abertas
                    {owner.today ? ` · ${owner.today} hoje` : ""}
                    {owner.high ? ` · ${owner.high} alta` : ""}
                  </span>
                </div>
              ))}
              {!data?.byOwner.length ? (
                <div className="py-2">
                  <AtlasEmpty
                    reason="completed"
                    eyebrow="Equipe sem pendências"
                    title="Sem tarefas visíveis"
                    description="A equipe ainda não possui ações abertas."
                  />
                </div>
              ) : null}
            </div>
            <p className="cc6-hairline mt-1 pt-2.5 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
              Consolidado para coordenar apoio · sem ranking e sem atribuição
              automática.
            </p>
          </section>
        ) : null}
      </div>

      {/* ── A RECORRÊNCIA DESCEU ─────────────────────────────────────────────
          Ficava entre o assistente e a fila, gastando altura de dobra com uma
          gaveta fechada. Encerrar uma repetição é administração — importa, é
          rara, e não é o que o corretor veio decidir às oito da manhã. O painel
          é o mesmo, os botões são os mesmos, a contagem é a mesma: só saiu da
          frente do que exige decisão. */}
      {recurrenceSeeds.length ? (
        <details
          className="cc6-panel-quiet cc6-reveal px-4 py-3"
          style={{ animationDelay: "140ms" }}
        >
          <summary className="cc6-eyebrow cursor-pointer list-none text-micro! transition-colors hover:text-[var(--atlas-texto-medio)]">
            FASE 43 · TAREFAS RECORRENTES · {recurrenceSeeds.length} ativa(s)
          </summary>
          <p className="mt-2 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
            Encerrar repetição para a geração de novas ocorrências e preserva as tarefas já criadas.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {recurrenceSeeds.map((task) => (
              <button
                type="button"
                key={task.recurrence_id}
                disabled={savingId === task.id}
                onClick={() => void act(task, "cancel_recurrence")}
                className="cc6-ghost-btn disabled:opacity-50"
              >
                Encerrar repetição · {task.title}
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
