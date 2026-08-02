"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import { AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";
import { ComissaoDoProjetoPanel } from "@/components/atlas/ComissaoDoProjetoPanel";

/* ══════════════════════════════════════════════════════════════════════════
   COMANDO DO LANÇAMENTO — O QUE FOI MEDIDO ANTES DE EDITAR

   ── 1. O TEMA CLARO APAGAVA A CAIXA DE ABSORÇÃO ───────────────────────────

   Medido no navegador, com o CSS compilado do servidor, forçando
   `data-theme="light"` e lendo `getComputedStyle`:

       caixa de absorção do herói     rótulo "Absorção"      1,46:1
       (fundo hex literal + /70)      "Entrega: …"           1,46:1

   Piso AA para texto pequeno: 4,5. A causa é a metade invertida do defeito já
   catalogado aqui: `text-slate-400` TEM sobrescrita de tema claro em
   globals.css e vira para quase-preto; o fundo era hex e não vira. Quase-preto
   sobre quase-preto. O valor literal não é repetido nem em prosa —
   `cor-cravada:check` conta o comentário também. O arquivo sai de 1 cor
   cravada para ZERO.

   ── 2. DUAS CIFRAS COM FONTE MORTA, DESENHADAS COMO FATO ──────────────────

   Em `app/api/v1/launch-os/route.ts`, duas linhas literais:

       const reservations: AnyRow[] = [];
       const intelligence: AnyRow[] = [];

   e, no mapa de saúde, `reservations: "not-configured"` e
   `intelligence: "not-configured"` CRAVADOS. Consequência na tela anterior:

     · "Prontidão do estudo" imprimia **0%** com barra em 0% — um zero que
       parece medição de dossiê vazio, quando o fato é que nada mediu.
     · "Antes de liberar para a IA" imprimia, em VERDE, "Nenhuma pendência
       registrada". Um verde falso é pior que um número faltando: ele autoriza.
       A frase continua no código e volta a aparecer no dia em que a fonte
       existir e vier de fato sem pendências.
     · "Reservadas" somava `m.reserved + m.activeReservations`, e a segunda
       parcela é sempre 0 pela fonte morta. A soma some; a contagem real do
       estoque fica, e a parcela sem fonte passa a ser dita.

   Cada cifra agora passa por `lastroDoModulo`: ou o número é MEDIDO, ou a
   célula diz "sem lastro" e escreve, no lugar do detalhe, o que falta.

   ── 3. ORDEM PELA CONSEQUÊNCIA, E OITO CAIXAS A MENOS ─────────────────────

   Antes, no primeiro nível: herói · painel de dossiê · 4 métricas de 148px ·
   comissão · saúde do estoque (4 caixas internas) · conversão (3 caixas
   internas). O veredito comercial — a única frase que diz o que fazer nas
   próximas 24 horas — ficava perdido no meio do herói, e o dossiê (que sempre
   diz "sem lastro") ocupava a posição 2.

   Agora: comando com o veredito · régua de onze medições · comissão ·
   dossiê · auditoria. Onze caixas com borda viraram três.

   ── 4. EMOJI: ONDE ENTROU E ONDE FOI RECUSADO ─────────────────────────────

   ENTROU na tira de saúde das conexões. Sete módulos lado a lado, quatro
   estados possíveis, e a pergunta que se faz ali é "qual deles está furado?" —
   varredura pura, resolvida hoje só por palavra e cor. O emoji dá a FORMA que
   faz o módulo diferente saltar sem ler os sete rótulos, e é o mesmo
   vocabulário da sala de comando e do painel de campanhas.

   NÃO ENTROU no selo de veredito comercial: é UM selo por página, não uma
   varredura, e ali o emoji não substituiria nada — seria um terceiro canal
   somado a palavra e cor, exatamente a redundância que o passe removeu dos
   deltas da sala de comando. NÃO ENTROU no status do empreendimento, nas onze
   cifras da régua, nos seis destinos de navegação, nem na lista de pendências
   do dossiê (lista homogênea: se todas as pendências recebem o mesmo símbolo,
   nenhuma informa).
   ══════════════════════════════════════════════════════════════════════════ */

type Metrics = {
  inventoryTotal: number; available: number; sold: number; reserved: number;
  totalVgv: number; soldVgv: number; absorption: number; pipeline: number;
  forecast: number; opportunities: number; campaignSpend: number;
  campaignRevenue: number; campaignLeads: number; cpl: number; roi: number;
  activeReservations: number;
};

type Development = {
  id: string; name: string; developer_name: string | null; neighborhood: string | null;
  city: string | null; state: string | null; status: string; delivery_date: string | null;
  launch_date?: string | null; metrics: Metrics;
  intelligence?: { onboarding_status: string; readiness_percent: number; missing_information: string[] } | null;
};

type ModuleStatus = "connected" | "legacy" | "not-configured" | "unavailable";

type Payload = {
  developments: Development[];
  moduleHealth?: Record<string, ModuleStatus>;
  generatedAt: string;
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";
/* Trilho de barra por token: `bg-white/[0.06]` é invisível sobre painel branco
   e a barra passa a dizer só "tem alguma coisa". */
const TRILHO = "color-mix(in srgb, var(--atlas-texto-fraco) 22%, transparent)";

const moduleLabels: Record<string, string> = {
  portfolio: "Portfólio",
  inventory: "Estoque",
  pipeline: "Pipeline",
  marketing: "Marketing",
  reservations: "Reservas",
  intelligence: "Inteligência",
  materials: "Materiais",
};

/* ── EMOJI DA SAÚDE DO MÓDULO ──────────────────────────────────────────────
   `aria-hidden` porque a palavra ao lado já nomeia o estado — o leitor de tela
   não deve ouvir "marca de verificação Portfólio conectado". O vocabulário é o
   que a base já usa: ✅ saudável, ⚠️ atenção, ⏳ aguardando, ⚙️ funcionando por
   caminho antigo. */
const EMOJI_DO_MODULO: Record<ModuleStatus, string> = {
  connected: "✅",
  legacy: "⚙️",
  "not-configured": "⏳",
  unavailable: "⚠️",
};

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

/* Célula da régua: número medido OU "sem lastro" e a frase do que falta no
   MESMO lugar onde ficaria o detalhe. Sem `truncate`: frase cortada com
   reticências não é frase. */
function Cifra({
  rotulo,
  detalhe,
  valor,
  lastro,
  carregando,
  children,
}: {
  rotulo: string;
  detalhe: ReactNode;
  valor: ReactNode;
  lastro: Lastro;
  carregando: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      {carregando ? (
        <p className="cc6-num text-numero leading-6 text-[var(--atlas-texto-fraco)]!">—</p>
      ) : lastro.medido ? (
        <p className="cc6-num text-numero leading-6 text-[var(--atlas-texto-forte)]!">{valor}</p>
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

/* Os seis destinos do projeto. `Abrir estoque` passou a PRIMÁRIA: é a única
   que muda estado (disponibilidade, reserva, preço); as outras cinco abrem
   leitura. Hierarquia por consequência — e nenhum destino saiu. */
const destinos = [
  { slug: "dossier", label: "Dossiê para IA" },
  { slug: "region-study", label: "Estudo regional" },
  { slug: "commercial-versions", label: "Vigência comercial" },
  { slug: "catalog", label: "Tipologias e diferenciais" },
] as const;

export default function DevelopmentCommandPage() {
  const { id } = useParams<{ id: string }>();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [item, setItem] = useState<Development | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) { setError("Sessão expirada."); setLoading(false); return; }
    try {
      const response = await fetch("/api/v1/launch-os", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const body = await response.json() as Payload & { error?: string };
      if (!response.ok) setError(body.error || "Falha ao carregar empreendimento.");
      else {
        setPayload(body);
        setItem(body.developments.find((development) => development.id === id) ?? null);
      }
    } catch {
      setError("Não foi possível conectar ao projeto. Verifique a conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const signal = useMemo(() => {
    if (!item) return { label: "Aguardando dados", tone: "neutral" as const, recommendation: "Conecte estoque, oportunidades e campanhas para ativar a inteligência do lançamento." };
    if (item.metrics.absorption < 15 && item.metrics.inventoryTotal > 0) return { label: "Atenção comercial", tone: "danger" as const, recommendation: "Revisar posicionamento, distribuição de leads e verba de aquisição nas próximas 24 horas." };
    if (item.metrics.roi < 0 && item.metrics.campaignSpend > 0) return { label: "Marketing ineficiente", tone: "warning" as const, recommendation: "Reduzir campanhas com baixo retorno e concentrar investimento nos públicos de maior conversão." };
    if (item.metrics.absorption >= 60) return { label: "Alta tração", tone: "success" as const, recommendation: "Preservar preço, priorizar unidades estratégicas e acelerar fechamento das oportunidades abertas." };
    return { label: "Operação saudável", tone: "info" as const, recommendation: "Manter cadência comercial e usar o forecast para direcionar esforços por tipologia e canal." };
  }, [item]);

  const saude = payload?.moduleHealth;
  const lastroEstoque = lastroDoModulo(saude, "inventory", "Estoque não respondeu. Zero aqui seria fonte ausente, não unidade ausente.");
  const lastroPipeline = lastroDoModulo(saude, "pipeline", "Pipeline não respondeu. R$ 0 aqui é silêncio, não ausência de negócio.");
  const lastroMarketing = lastroDoModulo(saude, "marketing", "Campanhas não responderam. Sem elas não há investimento nem CPL para apurar.");
  const lastroReservas = lastroDoModulo(saude, "reservations", "Nenhuma fonte de reservas está ligada ao portfólio.");
  const lastroDossie = lastroDoModulo(saude, "intelligence", "O dossiê ainda não tem fonte ligada ao portfólio: 0% aqui seria estudo vazio, e o fato é que nada mediu.");

  const modulosParaPreparar = Object.values(saude ?? {}).filter(
    (status) => status === "unavailable" || status === "not-configured",
  ).length;

  if (loading && !item) {
    return (
      <div className="space-y-4 pb-10" aria-busy="true">
        <AtlasSkeleton className="h-64 w-full" />
        <AtlasSkeleton className="h-40 w-full" />
      </div>
    );
  }
  if (error && !item) {
    return (
      <div
        role="alert"
        className="cc6-sev-band cc6-panel-quiet py-3 pl-5 pr-4 text-corpo leading-6 text-[var(--atlas-estado-perigo)]"
        style={{ "--cc6-sev": "var(--atlas-estado-perigo)" } as CSSProperties}
      >
        {error}
      </div>
    );
  }
  if (!item) {
    return (
      <AtlasEmpty
        title="Empreendimento não encontrado"
        description="O projeto pode ter sido removido ou não pertence à organização atual."
        action={<Link href="/developments" className="atlas-button-secondary min-h-11">Voltar ao portfólio</Link>}
      />
    );
  }

  const m = item.metrics;
  const dossie = item.intelligence;
  const pendencias = dossie?.missing_information ?? [];
  /* Duas ausências diferentes, ditas com frases diferentes: a fonte não está
     ligada (é o caso de hoje, cravado na rota) OU a fonte respondeu e este
     projeto ainda não tem estudo. Nenhuma das duas vira 0%. */
  const faltaDoDossie: string | null = !lastroDossie.medido
    ? lastroDossie.falta
    : dossie
      ? null
      : "A fonte do dossiê respondeu, mas este projeto ainda não tem estudo criado.";

  return (
    <div className="space-y-4 pb-10" data-development-layout="decision-first" aria-busy={loading}>
      {/* ── 1 · COMANDO ───────────────────────────────────────────────────
          Identidade, veredito, destinos e o único 34px da tela numa
          superfície só. */}
      <section aria-label="Comando do lançamento">
        <TiltShell className="cc6-panel cc6-reveal p-4 sm:p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="cc6-eyebrow">LAUNCH COMMAND</p>
              <h1 className="mt-1 max-w-2xl text-numero font-semibold leading-7 tracking-[-0.02em] text-[var(--atlas-texto-forte)]">
                {item.name}
              </h1>
              <p className="mt-1 max-w-2xl text-corpo leading-5 text-[var(--atlas-texto-medio)]">
                {item.developer_name || "Incorporadora não informada"} · {[item.neighborhood, item.city, item.state].filter(Boolean).join(" · ") || "Localização não informada"}
              </p>

              {/* O VEREDITO. Era a frase mais consequente da tela e vinha
                  depois de três selos decorativos; agora abre o bloco, com a
                  faixa de severidade à esquerda. */}
              <div
                className="cc6-sev-band cc6-panel-quiet mt-3 max-w-2xl py-2.5 pl-4 pr-3"
                style={{
                  "--cc6-sev": signal.tone === "danger"
                    ? "var(--atlas-estado-perigo)"
                    : signal.tone === "warning"
                      ? "var(--atlas-estado-atencao)"
                      : signal.tone === "success"
                        ? "var(--atlas-estado-sucesso)"
                        : "var(--atlas-accent)",
                } as CSSProperties}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={signal.tone}>{signal.label}</StatusBadge>
                  <StatusBadge tone="info">{item.status}</StatusBadge>
                </div>
                <p className="mt-1.5 text-corpo leading-5 text-[var(--atlas-texto-medio)]">{signal.recommendation}</p>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link href={`/developments/${id}/inventory`} className="atlas-button-primary min-h-11">Abrir estoque</Link>
                <Link href={`/developments/materials?project=${id}`} className={`cc6-ghost-btn ${focusRing}`}>Book, tabela e espelho</Link>
                {destinos.map((destino) => (
                  <Link key={destino.slug} href={`/developments/${id}/${destino.slug}`} className={`cc6-ghost-btn ${focusRing}`}>
                    {destino.label}
                  </Link>
                ))}
                <Link href="/developments" className={`cc6-ghost-btn ${focusRing}`}>
                  <span aria-hidden="true">←</span>
                  <span>Voltar ao portfólio</span>
                </Link>
              </div>
            </div>

            <div className="shrink-0 lg:w-60 lg:pl-6">
              <p className="cc6-eyebrow">Absorção</p>
              {loading ? (
                <p className="cc6-metric-value mt-1 text-heroi leading-none">—</p>
              ) : lastroEstoque.medido ? (
                <p className="cc6-metric-value mt-1 text-heroi leading-none">{m.absorption}%</p>
              ) : (
                <div className="mt-1"><SemLastro frase={lastroEstoque.falta} /></div>
              )}
              <p className="mt-1 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                {lastroEstoque.medido ? (
                  <>
                    <span className="cc6-num text-[var(--atlas-texto-medio)]!">{m.sold}</span> de <span className="cc6-num text-[var(--atlas-texto-medio)]!">{m.inventoryTotal}</span> unidades vendidas · contagem, não previsão
                  </>
                ) : (
                  lastroEstoque.falta
                )}
              </p>
              <div
                className="mt-2 h-1 overflow-hidden rounded-full"
                style={{ background: TRILHO }}
                role="progressbar"
                aria-label="Unidades vendidas"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={lastroEstoque.medido ? m.absorption : 0}
              >
                <div
                  className="h-full rounded-full bg-[color:var(--atlas-accent)]"
                  style={{ width: `${lastroEstoque.medido ? Math.min(100, Math.max(0, m.absorption)) : 0}%` }}
                />
              </div>
              <p className="mt-2 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                Entrega: {item.delivery_date ? new Date(item.delivery_date).toLocaleDateString("pt-BR") : "a definir"}
              </p>
            </div>
          </div>
        </TiltShell>
      </section>

      {/* ── 2 · ERRO ──────────────────────────────────────────────────────── */}
      <div aria-live="polite">
        {error ? (
          <div
            role="alert"
            className="cc6-sev-band cc6-panel-quiet py-3 pl-5 pr-4 text-corpo leading-6 text-[var(--atlas-estado-perigo)]"
            style={{ "--cc6-sev": "var(--atlas-estado-perigo)" } as CSSProperties}
          >
            {error}
          </div>
        ) : null}
      </div>

      {/* ── 3 · A RÉGUA ───────────────────────────────────────────────────
          Quatro métricas de 148px, quatro caixas de saúde do estoque e três
          linhas de conversão — onze superfícies com borda — viraram onze
          medições numa faixa só, separadas por ESPAÇO, não por filete. */}
      <section className="cc6-panel cc6-reveal p-4 sm:p-5" style={{ animationDelay: "60ms" }} aria-labelledby="development-inventory-title">
        <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <p className="cc6-eyebrow">Inventory intelligence</p>
            <h2 id="development-inventory-title" className="mt-0.5 text-corpo font-semibold leading-5 tracking-tight text-[var(--atlas-texto-forte)]">
              Saúde do estoque
            </h2>
          </div>
          <Link href={`/developments/${id}/inventory`} className={`text-rotulo font-semibold text-[color:var(--atlas-accent-hover)] transition-colors hover:text-[var(--atlas-texto-forte)] ${focusRing}`}>
            Abrir controle de unidades →
          </Link>
        </header>
        <p className="mt-1 text-micro leading-4 text-[var(--atlas-texto-medio)]">
          Distribuição das unidades e velocidade de absorção do empreendimento.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 2xl:grid-cols-6">
          <Cifra rotulo="Disponíveis" detalhe="prontas para distribuição" valor={m.available} lastro={lastroEstoque} carregando={loading} />
          <Cifra
            rotulo="Reservadas"
            /* A soma `m.reserved + m.activeReservations` saiu: a segunda parcela
               vem de uma fonte que a rota declara não-configurada e devolve
               sempre 0. O que fica é a contagem real do estoque, e a parcela
               sem fonte passa a ser DITA em vez de somada como zero. */
            detalhe={lastroReservas.medido ? "holds e reservas ativas" : "holds do sistema ainda não entram nesta conta"}
            valor={m.reserved}
            lastro={lastroEstoque}
            carregando={loading}
          />
          <Cifra rotulo="Vendidas" detalhe={`${m.sold} unidades concluídas`} valor={m.sold} lastro={lastroEstoque} carregando={loading} />
          <Cifra rotulo="Total" detalhe={`${m.inventoryTotal} unidades no estoque`} valor={m.inventoryTotal} lastro={lastroEstoque} carregando={loading} />
          <Cifra rotulo="VGV total" detalhe="Preço das unidades conectadas" valor={brl.format(m.totalVgv)} lastro={lastroEstoque} carregando={loading} />
          <Cifra rotulo="VGV vendido" detalhe={`${m.sold} unidades concluídas`} valor={brl.format(m.soldVgv)} lastro={lastroEstoque} carregando={loading} />
        </div>

        <header className="mt-6 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <p className="cc6-eyebrow">Commercial engine</p>
            <h2 className="mt-0.5 text-corpo font-semibold leading-5 tracking-tight text-[var(--atlas-texto-forte)]">
              Conversão e demanda
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/pipeline" className={`cc6-ghost-btn ${focusRing}`}>Pipeline</Link>
            <Link href="/marketing" className={`cc6-ghost-btn ${focusRing}`}>Campanhas</Link>
          </div>
        </header>
        <p className="mt-1 text-micro leading-4 text-[var(--atlas-texto-medio)]">
          Leitura rápida do potencial comercial e eficiência de aquisição.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 2xl:grid-cols-5">
          <Cifra rotulo="Pipeline bruto" detalhe="Soma das oportunidades visíveis" valor={brl.format(m.pipeline)} lastro={lastroPipeline} carregando={loading} />
          <Cifra rotulo="Forecast" detalhe={`${m.opportunities} oportunidades · previsão não garante fechamento`} valor={brl.format(m.forecast)} lastro={lastroPipeline} carregando={loading} />
          <Cifra rotulo="Investimento em mídia" detalhe="Verba atribuída a este projeto" valor={brl.format(m.campaignSpend)} lastro={lastroMarketing} carregando={loading} />
          <Cifra
            rotulo="CPL atribuído"
            detalhe={`${m.campaignLeads} leads atribuídos`}
            /* CPL só existe com verba E com lead. A rota calcula
               `cpl: leads > 0 ? spend / leads : 0` — ou seja, verba gasta com
               ZERO lead devolve 0, e imprimir "R$ 0" ali seria o melhor CPL
               possível anunciado justamente no pior caso (dinheiro gasto, nada
               entrou). O traço é ausência de base de cálculo: sem verba não há
               custo, sem lead não há por quem dividir. */
            valor={m.campaignSpend > 0 && m.campaignLeads > 0 ? brl.format(m.cpl) : "—"}
            lastro={lastroMarketing}
            carregando={loading}
          />
          <Cifra
            rotulo="ROI marketing"
            detalhe={`${m.campaignLeads} leads atribuídos`}
            valor={m.campaignSpend ? `${m.roi.toFixed(0)}%` : "—"}
            lastro={lastroMarketing}
            carregando={loading}
          />
        </div>
      </section>

      {/*
        COMISSAO E PREMIO DESTE PROJETO.

        A rota `/api/v1/developments/[id]/commission` foi construida hoje e ficou
        ORFA — nenhuma tela a consumia, e `commission_rules` seguia com zero linhas.
        Foi o portao `rotas-orfas:check`, escrito minutos depois, que pegou.

        O painel se esconde sozinho para quem nao e direcao: a rota responde 403, e
        comissao e dinheiro de terceiro — quem vende nao define quanto ganha.
      */}
      <section aria-label="Comissao e premio deste projeto">
        <ComissaoDoProjetoPanel developmentId={id} />
      </section>

      {/* ── 4 · DOSSIÊ ────────────────────────────────────────────────────
          Desceu de segundo para quarto bloco: enquanto a fonte não existir,
          ele só pode declarar que não mediu — e isso não decide nada. */}
      <section className="cc6-panel cc6-reveal p-4 sm:p-5" style={{ animationDelay: "100ms" }} aria-labelledby="development-dossier-title">
        <p className="cc6-eyebrow">Project intelligence</p>
        <h2 id="development-dossier-title" className="mt-0.5 text-corpo font-semibold leading-5 tracking-tight text-[var(--atlas-texto-forte)]">
          Dossiê do projeto e da região
        </h2>
        <p className="mt-1 max-w-3xl text-micro leading-4 text-[var(--atlas-texto-medio)]">
          Nasce junto com cada novo empreendimento e fica preparado para as IAs, sem transformar informação pendente em fato.
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,.7fr)_minmax(0,1.3fr)]">
          <div className="min-w-0">
            {loading ? (
              <p className="cc6-num text-numero leading-6 text-[var(--atlas-texto-fraco)]!">—</p>
            ) : dossie && !faltaDoDossie ? (
              <p className="cc6-num text-numero leading-6 text-[var(--atlas-texto-forte)]!">{dossie.readiness_percent}%</p>
            ) : (
              <SemLastro frase={faltaDoDossie ?? undefined} />
            )}
            <p className="cc6-metric-label mt-0.5 leading-4">Prontidão do estudo</p>
            <p className="mt-0.5 text-micro leading-4 text-[var(--atlas-texto-medio)]">
              {dossie && !faltaDoDossie
                ? "Conteúdo separado entre fatos, fontes e pendências."
                : "Aguardando criação automática do dossiê."}
            </p>
            {dossie && !faltaDoDossie ? (
              <div
                className="mt-1.5 h-1 overflow-hidden rounded-full"
                style={{ background: TRILHO }}
                role="progressbar"
                aria-label="Prontidão do estudo"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={dossie.readiness_percent}
              >
                <div className="h-full rounded-full bg-[color:var(--atlas-accent)]" style={{ width: `${Math.min(100, Math.max(0, dossie.readiness_percent))}%` }} />
              </div>
            ) : null}
          </div>
          <div className="min-w-0">
            <p className="cc6-metric-label leading-4">Antes de liberar para a IA</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {/* "Nenhuma pendência registrada" em VERDE só pode aparecer quando
                  a fonte respondeu E veio sem pendências. Sem fonte, o que se
                  diz é que não se sabe. */}
              {faltaDoDossie || !dossie ? (
                <StatusBadge tone="warning">Pendências não apuradas</StatusBadge>
              ) : pendencias.length ? (
                pendencias.map((valor) => <StatusBadge key={valor} tone="warning">{valor}</StatusBadge>)
              ) : (
                <StatusBadge tone="success">Nenhuma pendência registrada</StatusBadge>
              )}
            </div>
            {faltaDoDossie ? (
              <p className="mt-2 text-micro leading-4 text-[var(--atlas-texto-medio)]">{faltaDoDossie}</p>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── 5 · AUDITORIA ─────────────────────────────────────────────────
          Estado das conexões informa COMO a tela foi construída, não o que
          fazer: fica por último, recolhido, e continua declarando quantos
          módulos pedem preparo mesmo fechado. */}
      <details className="atlas-project-health cc6-panel-quiet cc6-reveal px-4 py-2" style={{ animationDelay: "140ms" }}>
        <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-[12px] text-corpo font-medium text-[var(--atlas-texto-forte)] ${focusRing}`}>
          <span>Saúde das conexões deste projeto</span>
          <span className="cc6-num text-rotulo text-[var(--atlas-texto-medio)]!">
            {modulosParaPreparar ? `${modulosParaPreparar} para preparar` : "Tudo conectado"}
          </span>
        </summary>
        <div className="cc6-hairline mt-2 flex flex-wrap gap-2 pt-2.5">
          {Object.entries(saude ?? {}).map(([modulo, status]) => {
            const copy = moduleCopy(status);
            return (
              <StatusBadge key={modulo} tone={copy.tone}>
                <span aria-hidden="true" className="text-corpo leading-none">{EMOJI_DO_MODULO[status]}</span>
                {moduleLabels[modulo] || modulo}: {copy.label}
              </StatusBadge>
            );
          })}
        </div>
        <p className="mt-2.5 pb-1 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
          Um módulo opcional indisponível não derruba os demais. Onde a fonte não respondeu, a régua acima diz &quot;sem lastro&quot; em vez de imprimir zero — reservas e dossiê estão nessa situação por construção da rota, não por falha deste projeto.
        </p>
      </details>
    </div>
  );
}
