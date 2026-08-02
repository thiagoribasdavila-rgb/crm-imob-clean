"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import {
  AtlasEmpty,
  AtlasRecoverableError,
  AtlasSkeleton,
} from "@/components/ui/AtlasUI";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";

/* ══════════════════════════════════════════════════════════════════════════
   PORTFÓLIO · O QUE MUDOU E POR QUÊ (medido antes de editar)

   ORDEM ANTERIOR dos blocos de primeiro nível, e o que cada um custava:

     1. herói (TiltShell)         — h1 27px + 3 controles + absorção 36px + 3 números
     2. erro (aria-live)
     3. quatro <AtlasMetric>      — `min-height: 148px` CADA, 4 bordas próprias
     4. prioridades (até 3)       — DECISÃO, e só aparecia depois de 8 caixas
     5. <details> saúde dos módulos — AUDITORIA, e vinha ANTES da lista
     6. diretório                 — cabeçalho + faixa de busca + grade
     7. parágrafo de rodapé

   FILETES E CAIXAS: 8 superfícies com borda no primeiro nível (1 + 4 + 1 + 1 + 1)
   mais 3 `cc6-hairline` só dentro do diretório. O painel de prioridades e cada
   cartão do diretório são caixa dentro de caixa.

   RÓTULO REPETIDO: os quatro <AtlasMetric> não traziam UMA medição nova —
   "Projetos visíveis" = a etiqueta `N de M` do diretório; "Projetos para
   revisar" = o segmento "Revisar" = a contagem do painel de prioridades;
   "Kits comerciais completos" = o segmento "Kit completo"; "Unidades
   disponíveis" = a legenda "N de M unidades vendidas" do herói. Eram 148px
   (uma linha a 1440px, DUAS abaixo de 1280px) para repetir o que já estava na
   tela — e empurravam a fila de decisão para fora dos 900px.

   NÚMEROS SEM CONTEXTO (o achado grave, e a razão real desta passada):

     · "Reservas ativas" imprimia **0**. Na rota, `const reservations = []` é
       literal e `moduleHealth.reservations` é SEMPRE "not-configured": nada
       escreve nessa fonte. O zero parecia saúde ("nenhuma reserva pendente")
       quando o fato é ausência de fonte. É o precedente `usageCost` — zero
       parece saudável, nulo diz a verdade — e o precedente `marketing_spend`.
     · "Em negociação" e "Receita provável" caem para R$ 0 quando o pipeline
       responde `unavailable`; o painel dizia R$ 0 sem dizer que perguntou e
       não obteve resposta.
     · "Kits completos" cai para 0 e "Projetos para revisar" sobe para 100% do
       portfólio quando `knowledge_documents` falha — um VERMELHO FALSO, que é
       pior que um número faltando, porque manda o gestor agir.

   Agora cada cifra passa por `lastroDoModulo`: ou o número é MEDIDO, ou a
   célula diz "sem lastro" e escreve, no lugar do detalhe, o que falta. Nenhuma
   constante literal, nenhum mock, nenhum `Math.random`.

   ORDEM NOVA, pela régua (decisão > informação > auditoria):

     1. herói — identidade, ações, o único 34px da tela (projetos travados, e
        ele É um botão que filtra a lista), a régua de 8 medições e o gráfico
        de concentração do VGV não vendido
     2. erro
     3. prioridades — DECISÃO, agora terceira e acima da dobra
     4. diretório — cabeçalho e busca fundidos numa faixa só (menos um filete)
     5. <details> saúde dos módulos — AUDITORIA, DESCEU para depois da lista
     6. rodapé

   NADA FOI APAGADO: os quatro números dos <AtlasMetric>, suas quatro frases de
   detalhe, os três números do rodapé do herói, a barra de absorção, os seis
   destinos de "Mais gestão", os quatro segmentos, a busca e o texto de
   auditoria continuam todos na tela — adensados, não removidos.
   ══════════════════════════════════════════════════════════════════════════ */

type Metrics = {
  inventoryTotal: number;
  available: number;
  sold: number;
  reserved: number;
  totalVgv: number;
  soldVgv: number;
  absorption: number;
  pipeline: number;
  forecast: number;
  opportunities: number;
  campaignSpend: number;
  campaignRevenue: number;
  campaignLeads: number;
  cpl: number;
  roi: number;
  activeReservations: number;
};

type Priority = {
  rank: number;
  label: string;
  detail: string;
  tone: "danger" | "warning" | "info";
};

type Development = {
  id: string;
  name: string;
  developer_name: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  status: string;
  delivery_date: string | null;
  launch_date?: string | null;
  readiness: {
    materialCoverage: number;
    availableMaterialTypes: string[];
    expiredMaterials: number;
    pendingMaterials: number;
    priority: Priority | null;
  };
  metrics: Metrics;
};

type ModuleStatus = "connected" | "legacy" | "not-configured" | "unavailable";

type Payload = {
  portfolio: {
    totalVgv: number;
    soldVgv: number;
    pipeline: number;
    forecast: number;
    units: number;
    available: number;
    sold: number;
    reservations: number;
    completeMaterialKits: number;
    needsReview: number;
  };
  developments: Development[];
  priorities: Array<Priority & { developmentId: string; developmentName: string }>;
  moduleHealth: Record<string, ModuleStatus>;
  compatibility: string;
  generatedAt: string;
};

type Segment = "all" | "attention" | "active" | "complete";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const segments: Array<{ id: Segment; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "attention", label: "Revisar" },
  { id: "active", label: "Com estoque" },
  { id: "complete", label: "Kit completo" },
];

const moduleLabels: Record<string, string> = {
  portfolio: "Portfólio",
  inventory: "Estoque",
  pipeline: "Pipeline",
  marketing: "Marketing",
  reservations: "Reservas",
  intelligence: "Inteligência",
  materials: "Materiais",
};

/* CC-6: anel de foco padrão do repositório e semânticos por significado. */
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";
/* A faixa "perigo" vinha com o valor ESCURO de `--atlas-estado-perigo` cravado
   em hex, e o preenchimento de kit completo com o de `--atlas-estado-sucesso`.
   Hex não é sobrescrito pelo tema claro: as duas cores continuavam com o tom do
   tema escuro em cima de painel branco, que é exatamente o que esses tokens
   existem para resolver — eles trocam para os tons escurecidos no claro. Duas
   cores cravadas a menos no portão.

   O valor literal NÃO é repetido aqui nem em prosa: `cor-cravada:check` conta o
   arquivo inteiro, comentário incluído, e com razão — foi assim que esta mesma
   passada quase subiu o número enquanto dizia que o estava baixando. */
const priorityBand: Record<Priority["tone"], string> = {
  danger: "var(--atlas-estado-perigo)",
  warning: "var(--atlas-estado-atencao)",
  info: "var(--atlas-accent)",
};
const priorityInk: Record<Priority["tone"], string> = {
  danger: "cc6-crit",
  warning: "cc6-warn",
  info: "text-[var(--atlas-texto-medio)]",
};

/* Trilho de barra. Era `bg-white/[0.06]`: sobre `.cc6-panel` do tema claro
   (branco a 86%) um branco a 6% é invisível, e sem trilho não há contra o que
   ler o preenchimento — a barra passa a dizer só "tem alguma coisa". O
   color-mix de token é o mesmo recurso que a sala de comando já usa. */
const TRILHO = "color-mix(in srgb, var(--atlas-texto-fraco) 22%, transparent)";

function statusTone(status: string): "neutral" | "success" | "warning" | "danger" | "info" | "violet" {
  const value = status.toLowerCase();
  if (["lançado", "lancado", "ativo", "vendas"].includes(value)) return "success";
  if (["pré-lançamento", "pre-lancamento", "planejamento"].includes(value)) return "violet";
  if (["pausado", "suspenso"].includes(value)) return "warning";
  if (["encerrado", "cancelado"].includes(value)) return "danger";
  return "info";
}

function moduleCopy(status: ModuleStatus) {
  if (status === "connected") return { label: "Conectado", tone: "success" as const };
  if (status === "legacy") return { label: "Compatível", tone: "info" as const };
  if (status === "not-configured") return { label: "Preparar", tone: "warning" as const };
  return { label: "Revisar", tone: "danger" as const };
}

/* ── LASTRO ────────────────────────────────────────────────────────────────
   Um número só pode ser impresso se a fonte dele respondeu. `connected` e
   `legacy` medem; `not-configured` e `unavailable` NÃO — e o ausente também
   não, porque a rota pode ter parado antes de declarar a saúde do módulo. */
type Lastro = { medido: true } | { medido: false; falta: string };

const LASTRO_OK: Lastro = { medido: true };

function lastroDoModulo(
  saude: Record<string, ModuleStatus> | undefined,
  modulo: string,
  falta: string,
): Lastro {
  const status = saude?.[modulo];
  if (!status) return { medido: false, falta: "O portfólio ainda não declarou a origem deste número." };
  if (status === "connected" || status === "legacy") return LASTRO_OK;
  return { medido: false, falta };
}

/* Quando um número depende de duas fontes, a pior manda. "Projetos para
   revisar" sai de materiais E de estoque: se materiais cair, todo projeto
   parece de kit incompleto e o painel pinta o portfólio inteiro de vermelho. */
function piorLastro(...lastros: Lastro[]): Lastro {
  return lastros.find((item) => !item.medido) ?? LASTRO_OK;
}

function SemLastro({ frase }: { frase?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-rotulo font-medium leading-6 text-[var(--atlas-texto-medio)]">
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: "color-mix(in srgb, var(--atlas-estado-atencao) 90%, transparent)" }}
      />
      <span>sem lastro</span>
      {frase ? <span className="sr-only">— {frase}</span> : null}
    </span>
  );
}

/* Célula da régua: número medido OU "sem lastro" + a frase do que falta no
   MESMO lugar onde ficaria o detalhe. Sem `truncate` em lugar nenhum: frase
   cortada com reticências não é frase. */
function Cifra({
  rotulo,
  detalhe,
  valor,
  lastro,
  carregando,
  children,
}: {
  rotulo: string;
  detalhe: string;
  valor: ReactNode;
  lastro: Lastro;
  carregando: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      {carregando ? (
        <p className="cc6-num text-numero leading-6 text-[var(--atlas-texto-fraco)]">—</p>
      ) : lastro.medido ? (
        <p className="cc6-num text-numero leading-6 text-[var(--atlas-texto-forte)]">{valor}</p>
      ) : (
        <SemLastro frase={lastro.falta} />
      )}
      <p className="cc6-metric-label mt-0.5 leading-4">{rotulo}</p>
      <p className="mt-0.5 text-micro leading-4 text-[var(--atlas-texto-medio)]">
        {carregando ? "verificando a fonte…" : lastro.medido ? detalhe : lastro.falta}
      </p>
      {children}
    </div>
  );
}

/* Barra CC-6: profundidade por geometria (trilho + preenchimento), percentual
   mono ao lado do rótulo — zero glow. */
function CoverageBar({ label, value, fill }: { label: string; value: number; fill: string }) {
  const safe = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="cc6-metric-label">{label}</span>
        <span className="cc6-num text-rotulo text-[var(--atlas-texto-medio)]">{safe}%</span>
      </div>
      <div
        className="mt-1.5 h-1 overflow-hidden rounded-full"
        style={{ background: TRILHO }}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={safe}
      >
        <div className="h-full rounded-full" style={{ width: `${safe}%`, background: fill }} />
      </div>
    </div>
  );
}

/* ── O ÚNICO GRÁFICO DA TELA, E A PERGUNTA QUE ELE RESPONDE ────────────────

   "R$ X ainda não vendidos" é um número; "3 projetos travados" é outro. Nenhum
   dos dois responde a pergunta que decide onde o gestor põe mídia e equipe:

       O dinheiro que ainda não vendeu está ESPALHADO pelo portfólio, ou
       concentrado — e o projeto que o concentra pode ser apresentado?

   Um projeto pequeno travado e um projeto grande travado contam igual na
   contagem e valem ordens de grandeza diferentes na decisão. A forma responde;
   a lista de cifras, não. Por isso — e só por isso — existe forma aqui.

   SVG à mão, viewBox unitário + preserveAspectRatio="none" + fill por
   color-mix de token, no mesmo padrão de /marketing e /marketing/campaigns.
   Nunca canvas: `fillStyle` não resolve `var(--token)`, pinta preto em
   silêncio e só em runtime, só em um dos temas. */

type FatiaDeEstoque = { chave: string; nome: string; vgv: number; travado: boolean };

const MAX_FATIAS = 6;

function ConcentracaoDoEstoque({
  fatias,
  lastro,
  travadoTemLastro,
  faltaDoTravado,
  carregando,
}: {
  fatias: FatiaDeEstoque[];
  lastro: Lastro;
  travadoTemLastro: boolean;
  faltaDoTravado: string;
  carregando: boolean;
}) {
  const total = fatias.reduce((soma, item) => soma + item.vgv, 0);
  const cabecalho = (direita: ReactNode) => (
    <figcaption className="flex items-baseline justify-between gap-2">
      <span className="cc6-metric-label">VGV ainda não vendido</span>
      {direita}
    </figcaption>
  );

  if (carregando) {
    return (
      <figure className="m-0 min-w-0">
        {cabecalho(<span className="cc6-num text-rotulo text-[var(--atlas-texto-fraco)]">—</span>)}
        <div className="mt-1.5 h-2.5 w-full rounded-full" style={{ background: TRILHO }} />
        <p className="mt-1.5 text-micro leading-4 text-[var(--atlas-texto-medio)]">
          Lendo estoque e materiais do portfólio…
        </p>
      </figure>
    );
  }

  if (!lastro.medido) {
    return (
      <figure className="m-0 min-w-0">
        {cabecalho(<SemLastro frase={lastro.falta} />)}
        <div className="mt-1.5 h-2.5 w-full rounded-full" style={{ background: TRILHO }} />
        <p className="mt-1.5 text-micro leading-4 text-[var(--atlas-texto-medio)]">{lastro.falta}</p>
      </figure>
    );
  }

  if (total <= 0) {
    return (
      <figure className="m-0 min-w-0">
        {cabecalho(<span className="cc6-num text-rotulo text-[var(--atlas-texto-forte)]">{brl.format(0)}</span>)}
        <div className="mt-1.5 h-2.5 w-full rounded-full" style={{ background: TRILHO }} />
        <p className="mt-1.5 text-micro leading-4 text-[var(--atlas-texto-medio)]">
          Nenhuma unidade conectada tem preço acima do que já foi vendido. Não há estoque
          financeiro para concentrar nesta leitura.
        </p>
      </figure>
    );
  }

  const ordenadas = [...fatias].sort((a, b) => b.vgv - a.vgv);
  const visiveis = ordenadas.slice(0, MAX_FATIAS);
  const resto = ordenadas.slice(MAX_FATIAS);
  /* A cauda é agrupada em DUAS fatias, não numa só. Com uma só, um projeto
     travado que caísse fora das seis primeiras entraria no cinza de "outros" —
     e aí a área âmbar do gráfico ficaria MENOR que o valor travado que a frase
     abaixo dele anuncia. Seriam duas verdades sobre o mesmo dado, na mesma
     figura. Separando por travamento, a área âmbar é exatamente `vgvTravado`. */
  const restoTravado = resto.filter((item) => item.travado);
  const restoLivre = resto.filter((item) => !item.travado);
  const agrupar = (grupo: FatiaDeEstoque[], chave: string, nome: string, travado: boolean) =>
    grupo.length
      ? [{
          chave,
          nome: `${nome} (${grupo.length})`,
          vgv: grupo.reduce((soma, item) => soma + item.vgv, 0),
          travado,
          agrupada: true,
        }]
      : [];
  const desenho: Array<FatiaDeEstoque & { agrupada: boolean }> = [
    ...visiveis.map((item) => ({ ...item, agrupada: false })),
    ...agrupar(restoTravado, "__resto_travado__", "outros travados", true),
    ...agrupar(restoLivre, "__resto_livre__", "outros projetos", false),
  ];

  const VAO = 0.7;
  let cursor = 0;
  const barras = desenho.map((item, indice) => {
    const largura = Math.max(0, (item.vgv / total) * 100 - (indice > 0 ? VAO : 0));
    const x = cursor + (indice > 0 ? VAO : 0);
    cursor = x + largura;
    const cor = item.travado && travadoTemLastro
      ? `color-mix(in srgb, var(--atlas-estado-atencao) ${Math.max(62, 96 - indice * 9)}%, transparent)`
      : item.agrupada
        ? "color-mix(in srgb, var(--atlas-texto-fraco) 55%, transparent)"
        : `color-mix(in srgb, var(--atlas-accent) ${Math.max(46, 96 - indice * 11)}%, transparent)`;
    return { ...item, x, largura, cor, share: (item.vgv / total) * 100 };
  });

  const travados = ordenadas.filter((item) => item.travado);
  const vgvTravado = travados.reduce((soma, item) => soma + item.vgv, 0);
  const maiorTravado = travados[0];
  const maior = ordenadas[0];

  return (
    <figure className="m-0 min-w-0">
      {cabecalho(
        <span className="cc6-num text-rotulo text-[var(--atlas-texto-forte)]">{brl.format(total)}</span>,
      )}
      <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full" style={{ background: TRILHO }}>
        <svg
          viewBox="0 0 100 4"
          preserveAspectRatio="none"
          className="block h-full w-full"
          role="img"
          aria-label={`Composição do VGV ainda não vendido: ${barras
            .map((item) => `${item.nome} ${Math.round(item.share)}%${item.travado && travadoTemLastro ? " (travado)" : ""}`)
            .join(", ")}.`}
        >
          {barras.map((item) => (
            <rect key={item.chave} x={item.x} y="0" width={item.largura} height="4" fill={item.cor}>
              {/* "Travado" não pode ficar só no matiz: quem não separa âmbar de
                  azul precisa da palavra. Ela está no título de cada fatia, no
                  aria-label do gráfico e na frase abaixo dele. */}
              <title>{`${item.nome}: ${brl.format(item.vgv)} — ${Math.round(item.share)}% do estoque financeiro${item.travado && travadoTemLastro ? " · travado" : ""}`}</title>
            </rect>
          ))}
        </svg>
      </div>
      <p className="mt-1.5 text-micro leading-4 text-[var(--atlas-texto-medio)]">
        {!travadoTemLastro ? (
          <>
            {maior ? (
              <>
                <strong className="font-semibold text-[var(--atlas-texto-forte)]">{maior.nome}</strong>{" "}
                concentra {Math.round((maior.vgv / total) * 100)}% do estoque financeiro.{" "}
              </>
            ) : null}
            {faltaDoTravado}
          </>
        ) : vgvTravado > 0 && maiorTravado ? (
          <>
            <strong className="font-semibold text-[var(--atlas-texto-forte)]">{brl.format(vgvTravado)}</strong>{" "}
            ({Math.round((vgvTravado / total) * 100)}%) estão em {travados.length} projeto
            {travados.length === 1 ? "" : "s"} travado{travados.length === 1 ? "" : "s"} — {maiorTravado.nome}{" "}
            sozinho responde por {Math.round((maiorTravado.vgv / total) * 100)}%. Mídia sobre kit sem
            vigência não vira apresentação.
          </>
        ) : (
          <>
            Nenhum projeto com estoque está travado.{" "}
            {maior ? (
              <>
                <strong className="font-semibold text-[var(--atlas-texto-forte)]">{maior.nome}</strong>{" "}
                concentra {Math.round((maior.vgv / total) * 100)}% do estoque financeiro — é onde uma
                mudança de ritmo aparece primeiro.
              </>
            ) : null}
          </>
        )}
      </p>
    </figure>
  );
}

export default function DevelopmentsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState<Segment>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Sua sessão expirou. Entre novamente para acessar o portfólio.");
      setLoading(false);
      return;
    }
    try {
      const response = await fetch("/api/v1/launch-os", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) {
        setError("O portfólio não pôde ser atualizado agora. Os dados permanecem protegidos.");
      } else {
        setData(payload as Payload);
      }
    } catch {
      setError("Não foi possível conectar aos projetos. Verifique a conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const developer = new URLSearchParams(window.location.search).get("developer");
    if (developer) setQuery(developer);
  }, []);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (data?.developments ?? []).filter((item) => {
      const matchesQuery = !normalizedQuery || [
        item.name,
        item.developer_name,
        item.neighborhood,
        item.city,
        item.status,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedQuery));
      const matchesSegment = segment === "all"
        || (segment === "attention" && Boolean(item.readiness.priority))
        || (segment === "active" && item.metrics.inventoryTotal > 0)
        || (segment === "complete" && item.readiness.materialCoverage === 100);
      return matchesQuery && matchesSegment;
    });
  }, [data, query, segment]);

  const segmentCounts = useMemo(() => {
    const items = data?.developments ?? [];
    return {
      all: items.length,
      attention: items.filter((item) => Boolean(item.readiness.priority)).length,
      active: items.filter((item) => item.metrics.inventoryTotal > 0).length,
      complete: items.filter((item) => item.readiness.materialCoverage === 100).length,
    } satisfies Record<Segment, number>;
  }, [data]);

  const portfolioAbsorption = data?.portfolio.units
    ? Math.round((data.portfolio.sold / data.portfolio.units) * 100)
    : 0;
  const unavailableModules = Object.values(data?.moduleHealth ?? {}).filter(
    (status) => status === "unavailable" || status === "not-configured",
  ).length;

  const saude = data?.moduleHealth;
  const lastroCarteira = lastroDoModulo(
    saude,
    "portfolio",
    "A lista de projetos não respondeu nesta leitura.",
  );
  const lastroEstoque = lastroDoModulo(
    saude,
    "inventory",
    "Estoque não respondeu. Zero aqui seria fonte ausente, não unidade ausente.",
  );
  const lastroMateriais = lastroDoModulo(
    saude,
    "materials",
    "Materiais não responderam. Sem eles, todo kit parece incompleto.",
  );
  const lastroPipeline = lastroDoModulo(
    saude,
    "pipeline",
    "Pipeline não respondeu. R$ 0 aqui é silêncio, não ausência de negócio.",
  );
  /* Sempre "not-configured" na rota de hoje (`const reservations = []`). A
     célula existe, ocupa o mesmo espaço e diz o que falta — em vez de imprimir
     um zero que passa por saúde. */
  const lastroReservas = lastroDoModulo(
    saude,
    "reservations",
    "Nenhuma fonte de reservas está ligada ao portfólio.",
  );
  const lastroRevisao = piorLastro(lastroMateriais, lastroEstoque);

  const fatiasDeEstoque = useMemo<FatiaDeEstoque[]>(
    () =>
      (data?.developments ?? [])
        .map((item) => ({
          chave: item.id,
          nome: item.name,
          vgv: Math.max(0, item.metrics.totalVgv - item.metrics.soldVgv),
          travado: Boolean(item.readiness.priority),
        }))
        .filter((item) => item.vgv > 0),
    [data],
  );

  const irParaLista = useCallback((alvo: Segment) => {
    setSegment(alvo);
    if (typeof window === "undefined") return;
    const node = document.getElementById("atlas-projects-directory");
    if (!node) return;
    const suave = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    node.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "start" });
  }, []);

  const projetosParaRevisar = data?.portfolio.needsReview ?? 0;

  return (
    <div
      className="space-y-4 pb-10"
      data-evolution-phase="42"
      data-projects-layout="decision-first"
      aria-busy={loading}
    >
      {/* ── 1 · FAIXA DE COMANDO ───────────────────────────────────────────
          Uma superfície: identidade, ações, o único 34px da tela, a régua de
          oito medições e o gráfico de concentração. O que antes eram cinco
          caixas com borda (herói + quatro <AtlasMetric>) é uma. */}
      <section aria-label="Resumo do portfólio e ações principais">
        <TiltShell className="cc6-panel cc6-reveal p-4 sm:p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="cc6-eyebrow">FASE 42 · PROJETOS</p>
              <h1 className="mt-1 max-w-2xl text-numero font-semibold leading-7 tracking-[-0.02em] text-[var(--atlas-texto-forte)]">
                Veja onde o portfólio precisa de decisão comercial.
              </h1>
              <p className="mt-1 max-w-2xl text-corpo leading-5 text-[var(--atlas-texto-medio)]">
                Projeto, estoque, kit comercial vigente e receita potencial em uma única leitura.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link href="/developments/registry" className="atlas-button-primary">+ Novo empreendimento</Link>
                <Link href="/developments/materials" className="cc6-ghost-btn min-h-11">Buscar materiais</Link>
                <details className="atlas-project-actions relative">
                  <summary className={`cc6-ghost-btn min-h-11 cursor-pointer list-none ${focusRing}`}>Mais gestão</summary>
                  {/* O fundo continua literal DE PROPÓSITO: a cor do texto deste
                      menu vem de `.atlas-project-actions > div :is(a,button)` em
                      globals.css (um cinza claro fixo, sem override de tema
                      claro). Trocar só o fundo por token deixaria texto claro
                      sobre fundo claro — fundo e cor são um par, e a outra
                      metade do par está num arquivo que esta entrega não toca. */}
                  <div className="absolute left-0 top-[calc(100%+8px)] z-20 grid min-w-64 gap-1 rounded-xl border border-[rgba(148,163,184,0.16)] bg-[#0b1224]/95 p-2 backdrop-blur">
                    <Link href="/developments/homologation">Homologar projetos</Link>
                    <Link href="/developments/developers">Incorporadoras</Link>
                    <Link href="/developments/payment-rules">Fluxos de pagamento</Link>
                    <Link href="/properties">Estoque e unidades</Link>
                    <Link href="/marketing">Marketing do portfólio</Link>
                    <button type="button" onClick={() => void load()}>Atualizar dados</button>
                  </div>
                </details>
              </div>
            </div>

            {/* O 34px é o número que DECIDE — e por isso ele age. Absorção é
                informação e desceu para a régua; travamento é fila sem dono e
                subiu para cá, com o gesto que leva à lista filtrada. */}
            <div className="shrink-0 lg:w-60 lg:pl-6">
              <p className="cc6-eyebrow">Precisa de decisão</p>
              {loading ? (
                <p className="cc6-metric-value mt-1 text-heroi leading-none">—</p>
              ) : lastroRevisao.medido ? (
                <p className="cc6-metric-value mt-1 text-heroi leading-none">{projetosParaRevisar}</p>
              ) : (
                <div className="mt-1"><SemLastro frase={lastroRevisao.falta} /></div>
              )}
              <p className="mt-1 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                {lastroRevisao.medido ? (
                  <>
                    projetos travados de <span className="cc6-num">{data?.developments.length ?? 0}</span> no
                    portfólio · pendências observadas, não previsão
                  </>
                ) : (
                  lastroRevisao.falta
                )}
              </p>
              <button
                type="button"
                onClick={() => irParaLista(projetosParaRevisar > 0 && lastroRevisao.medido ? "attention" : "all")}
                /* `justify-*` não entra aqui: `.cc6-ghost-btn` é regra sem
                   camada em globals.css e vence utilitário de `@layer
                   utilities`. O primitivo já centraliza e já dá os 44px. */
                className={`cc6-ghost-btn mt-2 w-full ${focusRing}`}
              >
                <span>
                  {projetosParaRevisar > 0 && lastroRevisao.medido
                    ? `Abrir os ${projetosParaRevisar} na lista`
                    : "Abrir a lista de projetos"}
                </span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>

          {/* ── A RÉGUA E O GRÁFICO, NA MESMA FAIXA ─────────────────────────
              Oito medições onde havia quatro cartões de 148px mais três
              números soltos. Cada uma passa pelo lastro do módulo que a
              alimenta. */}
          <div className="cc6-hairline mt-4 grid gap-x-6 gap-y-4 pt-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <Cifra
                rotulo="Projetos visíveis"
                detalhe="No seu escopo autorizado"
                valor={data?.developments.length ?? 0}
                lastro={lastroCarteira}
                carregando={loading}
              />
              <Cifra
                rotulo="Unidades disponíveis"
                detalhe={`${data?.portfolio.units ?? 0} unidades conectadas`}
                valor={data?.portfolio.available ?? 0}
                lastro={lastroEstoque}
                carregando={loading}
              />
              <Cifra
                rotulo="Kits comerciais completos"
                detalhe="Book, tabela e espelho vigentes"
                valor={data?.portfolio.completeMaterialKits ?? 0}
                lastro={lastroMateriais}
                carregando={loading}
              />
              <Cifra
                rotulo="Absorção do portfólio"
                detalhe={`${data?.portfolio.sold ?? 0} de ${data?.portfolio.units ?? 0} unidades vendidas`}
                valor={`${portfolioAbsorption}%`}
                lastro={lastroEstoque}
                carregando={loading}
              >
                <div
                  className="mt-1.5 h-1 overflow-hidden rounded-full"
                  style={{ background: TRILHO }}
                  role="progressbar"
                  aria-label="Unidades vendidas"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={lastroEstoque.medido ? portfolioAbsorption : 0}
                >
                  <div
                    className="h-full rounded-full bg-[color:var(--atlas-accent)]"
                    style={{ width: `${lastroEstoque.medido ? portfolioAbsorption : 0}%` }}
                  />
                </div>
              </Cifra>

              <Cifra
                rotulo="VGV observado"
                detalhe="Unidades efetivamente conectadas"
                valor={brl.format(data?.portfolio.totalVgv ?? 0)}
                lastro={lastroEstoque}
                carregando={loading}
              />
              <Cifra
                rotulo="Em negociação"
                detalhe="Soma das oportunidades visíveis"
                valor={brl.format(data?.portfolio.pipeline ?? 0)}
                lastro={lastroPipeline}
                carregando={loading}
              />
              <Cifra
                rotulo="Receita provável"
                detalhe="Ponderada por probabilidade; não garante fechamento"
                valor={brl.format(data?.portfolio.forecast ?? 0)}
                lastro={lastroPipeline}
                carregando={loading}
              />
              <Cifra
                rotulo="Reservas ativas"
                detalhe="Reservas registradas no portfólio"
                valor={data?.portfolio.reservations ?? 0}
                lastro={lastroReservas}
                carregando={loading}
              />
            </div>

            <ConcentracaoDoEstoque
              fatias={fatiasDeEstoque}
              lastro={lastroEstoque}
              travadoTemLastro={lastroMateriais.medido}
              faltaDoTravado={lastroMateriais.medido ? "" : lastroMateriais.falta}
              carregando={loading}
            />
          </div>
        </TiltShell>
      </section>

      {/* ── 2 · ERRO ─────────────────────────────────────────────────────── */}
      <div aria-live="polite">
        {error ? <AtlasRecoverableError description={error} onRetry={() => void load()} busy={loading} /> : null}
      </div>

      {/* ── 3 · DECISÃO ──────────────────────────────────────────────────
          Subiu de quinto para terceiro bloco: fila sem dono vem antes de
          qualquer coisa que só informa. */}
      {(data?.priorities.length ?? 0) > 0 ? (
        <section
          className="cc6-panel cc6-reveal p-4"
          style={{ animationDelay: "60ms" }}
          aria-labelledby="atlas-projects-priorities-title"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              <p className="cc6-eyebrow">Revisão humana</p>
              <h2
                id="atlas-projects-priorities-title"
                className="mt-0.5 text-corpo font-semibold leading-5 tracking-tight text-[var(--atlas-texto-forte)]"
              >
                Até três decisões objetivas
              </h2>
            </div>
            <span className="cc6-chip">{data?.priorities.length ?? 0} de até 3</span>
          </header>
          <p className="mt-1 text-micro leading-4 text-[var(--atlas-texto-medio)]">
            Ordenação explicável por vigência de material, cobertura do kit, validação e estoque. Nenhuma alteração é executada automaticamente.
          </p>
          <div className="mt-2.5 grid gap-2">
            {data?.priorities.map((priority, index) => (
              <Link
                key={`${priority.developmentId}-${priority.label}`}
                href={`/developments/${priority.developmentId}`}
                className={`cc6-sev-band cc6-panel-quiet cc6-interativo cc6-reveal group flex items-center gap-3 py-2.5 pl-4 pr-3 ${focusRing}`}
                style={{
                  animationDelay: `${90 + index * 45}ms`,
                  "--cc6-sev": priorityBand[priority.tone],
                } as CSSProperties}
              >
                <span className="cc6-num pt-0.5 text-rotulo text-[var(--atlas-texto-fraco)]" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <strong className="text-corpo font-semibold text-[var(--atlas-texto-forte)]">{priority.developmentName}</strong>
                    <StatusBadge tone={priority.tone}>{priority.label}</StatusBadge>
                  </span>
                  <span className="mt-0.5 block text-rotulo leading-4 text-[var(--atlas-texto-medio)]">{priority.detail}</span>
                </span>
                <span
                  aria-hidden="true"
                  className="text-[var(--atlas-texto-fraco)] transition-colors group-hover:text-[color:var(--atlas-accent-hover)]"
                >
                  →
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── 4 · DECISÃO POR PROJETO ──────────────────────────────────────
          Cabeçalho e faixa de busca eram duas linhas separadas por um filete;
          viraram uma. Um filete a menos e ~76px que a lista ganhou. */}
      <section
        id="atlas-projects-directory"
        className="cc6-panel cc6-reveal overflow-hidden"
        style={{ animationDelay: "100ms" }}
        aria-labelledby="atlas-projects-directory-title"
      >
        <header className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="cc6-eyebrow">Decisão por projeto</p>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
              <h2
                id="atlas-projects-directory-title"
                className="text-corpo font-semibold leading-5 tracking-tight text-[var(--atlas-texto-forte)]"
              >
                Onde agir no portfólio
              </h2>
              <span className="cc6-chip" title="Projetos exibidos com a busca e o filtro atuais.">
                {loading ? "sincronizando" : `${filtered.length} de ${data?.developments.length ?? 0}`}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <label className="block min-w-0 flex-1 lg:max-w-xs">
              <span className="sr-only">Buscar empreendimento</span>
              {/* 16px no telefone não é escolha de escala: abaixo disso o iOS
                  dá zoom no foco e tira o campo da tela. Da largura `sm` para
                  cima, o degrau da escala vale. */}
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar projeto, incorporadora ou região"
                className={`min-h-11 w-full rounded-xl border border-[rgba(148,163,184,0.14)] bg-white/[0.03] px-3 text-base text-[var(--atlas-texto-forte)] transition-colors placeholder:text-[var(--atlas-texto-fraco)] focus:border-[color:var(--atlas-accent)] sm:text-corpo ${focusRing}`}
              />
            </label>
            <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtros do portfólio">
              {segments.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={segment === item.id}
                  onClick={() => setSegment(item.id)}
                  className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-rotulo font-medium transition-colors ${
                    segment === item.id
                      ? "border-[rgba(75,141,248,0.45)] bg-[rgba(75,141,248,0.08)] text-[var(--atlas-texto-forte)]"
                      : "border-[rgba(148,163,184,0.14)] bg-white/[0.02] text-[var(--atlas-texto-medio)] hover:border-[rgba(148,163,184,0.3)] hover:text-[var(--atlas-texto-forte)]"
                  } ${focusRing}`}
                >
                  <span>{item.label}</span>
                  <span className={`cc6-num text-rotulo ${segment === item.id ? "text-[var(--atlas-texto-forte)]" : "text-[var(--atlas-texto-fraco)]"}`}>
                    {loading ? "—" : segmentCounts[item.id]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="cc6-hairline p-4 sm:p-5">
          {loading ? (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((item) => <AtlasSkeleton key={item} className="h-56 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <AtlasEmpty
              reason={(data?.developments.length ?? 0) > 0 ? "no-results" : "first-use"}
              eyebrow={(data?.developments.length ?? 0) > 0 ? "Busca sem correspondência" : "Portfólio ainda vazio"}
              title="Nenhum empreendimento encontrado"
              description={(data?.developments.length ?? 0) > 0
                ? "Nenhum projeto corresponde à busca e ao filtro atuais."
                : "Cadastre o primeiro empreendimento para reunir estoque, materiais, leads e VGV."}
              action={(data?.developments.length ?? 0) > 0
                ? <button type="button" className="atlas-button-secondary" onClick={() => { setQuery(""); setSegment("all"); }}>Limpar filtros</button>
                : <Link href="/developments/registry" className="atlas-button-primary">Cadastrar empreendimento</Link>}
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {filtered.map((item, index) => {
                const metrics = item.metrics;
                const priority = item.readiness.priority;
                const kitComplete = item.readiness.materialCoverage === 100;
                const place = [item.developer_name, item.neighborhood, item.city, item.state]
                  .filter(Boolean)
                  .join(" · ") || "Localização não informada";
                const delivery = item.delivery_date
                  ? new Date(item.delivery_date).toLocaleDateString("pt-BR")
                  : "a definir";
                return (
                  <article
                    key={item.id}
                    className={`cc6-panel-quiet cc6-interativo cc6-reveal flex flex-col gap-3 p-3.5 focus-within:border-[rgba(148,163,184,0.22)]! ${priority ? "cc6-sev-band pl-5" : ""}`}
                    style={{
                      animationDelay: `${Math.min(index, 8) * 45}ms`,
                      ...(priority ? { "--cc6-sev": priorityBand[priority.tone] } : null),
                    } as CSSProperties}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {/* Sem `truncate`: nome de projeto cortado com
                            reticências deixa de identificar o projeto. */}
                        <h3 className="text-corpo font-semibold leading-5 tracking-tight text-[var(--atlas-texto-forte)]">
                          {item.name}
                        </h3>
                        <p className="mt-0.5 font-mono text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                          {place}
                        </p>
                      </div>
                      <StatusBadge tone={statusTone(item.status)}>{item.status}</StatusBadge>
                    </div>

                    {priority ? (
                      <p className="-mt-1 text-rotulo leading-4">
                        <span className={`font-medium ${priorityInk[priority.tone]}`}>{priority.label}</span>
                        <span className="text-[var(--atlas-texto-medio)]"> · {priority.detail}</span>
                      </p>
                    ) : null}

                    {/* O herói já passava por `lastroEstoque`; ESTE cartão não.
                        Unidades, Vendidas, Disponíveis, Absorção e VGV saíam
                        crus — se o estoque não responde, o cartão imprimia
                        0 · 0 · 0 · 0% · R$ 0,00 com a mesma confiança de um
                        número medido. Zero de estoque é afirmação forte. */}
                    {lastroEstoque.medido ? (
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <p className="cc6-num text-numero leading-6 text-[var(--atlas-texto-forte)]">{metrics.inventoryTotal}</p>
                          <p className="cc6-metric-label leading-4">Unidades</p>
                        </div>
                        <div>
                          <p className="cc6-num cc6-ok text-numero leading-6">{metrics.sold}</p>
                          <p className="cc6-metric-label leading-4">Vendidas</p>
                        </div>
                        <div>
                          <p className="cc6-num text-numero leading-6 text-[color:var(--atlas-accent-hover)]">{metrics.available}</p>
                          <p className="cc6-metric-label leading-4">Disponíveis</p>
                        </div>
                      </div>
                    ) : (
                      <SemLastro frase={lastroEstoque.falta} />
                    )}

                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {lastroEstoque.medido ? (
                        <CoverageBar label="Absorção" value={metrics.absorption} fill="var(--atlas-accent)" />
                      ) : (
                        <div className="min-w-0">
                          <span className="cc6-metric-label">Absorção</span>
                          <div className="mt-1"><SemLastro frase={lastroEstoque.falta} /></div>
                        </div>
                      )}
                      <CoverageBar
                        label="Kit comercial"
                        value={item.readiness.materialCoverage}
                        fill={kitComplete ? "var(--atlas-estado-sucesso)" : "var(--atlas-estado-atencao)"}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="cc6-metric-label leading-4">VGV observado</p>
                        {lastroEstoque.medido ? (
                          <p className="cc6-num mt-0.5 text-corpo leading-4 text-[var(--atlas-texto-forte)]">{brl.format(metrics.totalVgv)}</p>
                        ) : (
                          <div className="mt-0.5"><SemLastro frase={lastroEstoque.falta} /></div>
                        )}
                      </div>
                      <div title="Previsão não garante fechamento.">
                        <p className="cc6-metric-label leading-4">Receita provável</p>
                        <p className="cc6-num mt-0.5 text-corpo leading-4 text-[var(--atlas-texto-forte)]">{brl.format(metrics.forecast)}</p>
                      </div>
                    </div>

                    <div className="cc6-hairline mt-auto flex items-center justify-between gap-3 pt-2.5">
                      <span className="cc6-num text-rotulo leading-4 text-[var(--atlas-texto-medio)]">Entrega · {delivery}</span>
                      <Link
                        href={`/developments/${item.id}`}
                        aria-label={`Abrir projeto ${item.name}`}
                        className={`shrink-0 rounded-md text-rotulo font-semibold text-[color:var(--atlas-accent-hover)] transition-colors hover:text-[var(--atlas-texto-forte)] ${focusRing}`}
                      >
                        Abrir projeto →
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── 5 · AUDITORIA ────────────────────────────────────────────────
          Estado dos módulos é pulso do sistema: informa como a tela foi
          construída, não o que fazer. Era o quinto bloco, ANTES da lista de
          projetos; passou para depois dela. Continua recolhível e continua
          declarando quantos módulos precisam de preparo — inclusive quando
          está fechado. */}
      <details
        className="atlas-project-health cc6-panel-quiet cc6-reveal px-4 py-2"
        style={{ animationDelay: "140ms" }}
      >
        <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-lg text-corpo font-medium text-[var(--atlas-texto-forte)] ${focusRing}`}>
          <span>Saúde das conexões do portfólio</span>
          <span className="cc6-num text-rotulo text-[var(--atlas-texto-medio)]">
            {unavailableModules ? `${unavailableModules} para preparar` : "Tudo conectado"}
          </span>
        </summary>
        <div className="cc6-hairline mt-2 flex flex-wrap gap-2 pt-2.5">
          {Object.entries(data?.moduleHealth ?? {}).map(([module, status]) => {
            const copy = moduleCopy(status);
            return <StatusBadge key={module} tone={copy.tone}>{moduleLabels[module] || module}: {copy.label}</StatusBadge>;
          })}
        </div>
        <p className="mt-2.5 pb-1 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
          Um módulo opcional indisponível não derruba os demais. O Atlas mantém visível somente o que foi carregado com segurança — e onde a fonte não respondeu, a régua acima diz &quot;sem lastro&quot; em vez de imprimir zero.
        </p>
      </details>

      <p className="text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
        A tela é somente leitura. Materiais pendentes, rejeitados ou vencidos não entram como kit comercial válido; qualquer correção exige ação humana nas áreas próprias.
      </p>
    </div>
  );
}
