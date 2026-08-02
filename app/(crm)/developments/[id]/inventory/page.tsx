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

/* ══════════════════════════════════════════════════════════════════════════
   ESPELHO DE VENDAS — O QUE FOI MEDIDO ANTES DE EDITAR

   ── 1. O TEMA CLARO APAGAVA O PREÇO DA UNIDADE ────────────────────────────

   Medido no navegador, com o CSS compilado do servidor, forçando
   `data-theme="light"` e lendo `getComputedStyle` de cada trecho de texto:

       superfície                        trecho              razão (claro)
       cartão da unidade                 preço da unidade      2,05:1
       (fundo hex literal a 75%)         título da unidade     2,05:1
                                         torre · unidade       1,74:1
       caixa de absorção do herói        rótulo "Absorção"     1,46:1
       (fundo hex literal a 70%)         "Entrega: …"          1,46:1

   O piso AA para texto pequeno é 4,5. O preço de cada unidade do espelho
   ficava em 2,05 — e o dono trabalha no tema claro.

   A causa é a metade INVERTIDA do defeito já catalogado neste repositório
   ("o fundo vira, o texto não"): aqui o TEXTO vira e o FUNDO não. `text-white`
   e `text-slate-400/500` TÊM sobrescrita de tema claro em globals.css — viram
   para quase-preto. Os dois fundos eram hex literal, e hex não vira.
   Resultado: quase-preto sobre quase-preto.

   Os valores literais NÃO são escritos aqui nem em prosa: `cor-cravada:check`
   conta o arquivo inteiro, comentário incluído — e a primeira versão deste
   comentário subiu o portão em 4 enquanto anunciava que o estava baixando.
   Este arquivo sai de 3 cores cravadas para ZERO.

   ── 2. "VGV DO ESTOQUE" SOMAVA AUSÊNCIA COMO ZERO ─────────────────────────

   Na rota (`app/api/v1/developments/[id]/inventory/route.ts`):

       acc.totalVgv += Number(item.price ?? 0)

   Unidade sem preço entra na soma valendo zero, e o painel imprimia o
   resultado como se fosse VGV medido. É o modo de falha que esta base já
   pagou duas vezes (`usageCost`, `marketing_spend`): zero parece saúde,
   ausência de fonte é outra coisa.

   O conserto não inventa número — CONTA as unidades sem preço nas linhas que
   a própria rota devolveu (`payload.inventory`), e o painel declara:
   nenhuma unidade com preço → "sem lastro" e o que falta; algumas sem preço →
   o valor com "parcial · N de M sem preço" no lugar do detalhe. Só quando
   todas têm preço a cifra se apresenta como completa.

   ── 3. DUAS CLASSIFICAÇÕES PARA O MESMO DADO ──────────────────────────────

   A rota classifica a unidade só pelos valores em inglês; a página sempre
   aceitou também os equivalentes em português. Com as duas vivas ao mesmo
   tempo, uma linha antiga aparecia "Vendida" no cartão e entrava como
   "Disponível" na régua — a classe "caminhos divergentes" desta base, dentro
   de uma tela só. Agora a MESMA função classifica cartão, filtro, contagem e
   VGV, sobre as linhas que a própria rota devolveu.

   ── 4. A RESERVA NÃO DIZIA SE JÁ TINHA VENCIDO ────────────────────────────

   "Hold até 02/08/2026 14:30" era impresso igual se o prazo vencia em 20
   minutos ou se tinha vencido há 3 horas. Quem lê fazia a conta de cabeça.
   Agora o cartão diz o TEMPO QUE FALTA (ou o que já passou), com a tinta de
   atenção/perigo — um canal que não existia.

   ── 5. ORDEM PELA CONSEQUÊNCIA ────────────────────────────────────────────

   Ordem anterior: herói · 4 métricas de 148px · erro · FORMULÁRIO DE CADASTRO
   (8 campos) · mapa de unidades.

   O formulário é ENTRADA DE DADOS de retaguarda; o mapa é a superfície onde
   se decide o que vender e o que reservar. O mapa começava depois de ~1.100px
   de rolagem. Agora: comando (identidade + régua) · erro · MAPA · cadastro ·
   auditoria da conexão. Nada foi apagado — os 8 campos, os 4 filtros, a busca
   e cada rótulo continuam na tela.

   ── 6. EMOJI, E ONDE ELE FOI RECUSADO ─────────────────────────────────────

   ENTROU no estado da unidade. O mapa é lido em VARREDURA: dezenas de
   cartões iguais lado a lado, onde a única pergunta é "esta dá para vender?".
   Hoje o estado tinha PALAVRA + COR e nenhuma FORMA — quem não separa âmbar de
   azul, ou quem passa o olho sem ler, não tinha canal nenhum. O emoji entra
   com `aria-hidden` (a palavra ao lado já nomeia o estado) e reusa o
   vocabulário que a sala de comando e o painel de campanhas já estabeleceram
   (✅ concluído, ⛔ impedido, ⏳ aguardando).

   NÃO ENTROU no prazo da reserva: a unidade reservada já carrega ⏳ no
   estado, e um segundo relógio no mesmo cartão seria a redundância que o
   emoji acabou de resolver. NÃO ENTROU no status do empreendimento no herói:
   ali existe UM projeto, não uma varredura — seria decoração de título. NÃO
   ENTROU nas cifras da régua nem nos filtros.
   ══════════════════════════════════════════════════════════════════════════ */

type Reservation = { id: string; status: string; hold_expires_at: string | null; lead_id: string | null; customer_id: string | null };
type Property = {
  id: string; title: string | null; unit_number: string | null; floor: number | null; typology: string | null;
  price: number | null; area: number | null; bedrooms: number | null; bathrooms: number | null;
  parking_spaces: number | null; status: string | null; updated_at: string | null; activeReservation: Reservation | null;
  tower: string | null; orientation: string | null; typology_id: string | null; list_price: number | null;
  inventory_source: string; inventory_version: number; availability_updated_at: string; last_synced_at: string | null;
};
type Payload = {
  development: { id: string; name: string; developer_name: string | null; neighborhood: string | null; city: string | null; state: string | null; status: string };
  inventory: Property[];
  typologies: { id: string; code: string; name: string; private_area: number; bedrooms: number | null; price_from: number | null }[];
  events: { id: string; property_id: string; event_type: string; reason: string; inventory_version: number; created_at: string }[];
  /* Continua declarado porque a rota continua devolvendo — mas esta página NÃO
     lê mais daqui. Ver "UMA TELA, UMA VERDADE" mais abaixo: contar duas vezes,
     com duas classificações diferentes, foi o defeito. */
  metrics: { total: number; available: number; reserved: number; sold: number; blocked: number; totalVgv: number; soldVgv: number; absorption: number };
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/* Anel de foco padrão do repositório. */
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";

/* ── O CAMPO QUE SOME NO TEMA CLARO, E POR QUE NÃO ADIANTA TROCAR O TOKEN ──

   `app/globals.css` tem, na base e SEM CAMADA:

       input, select, textarea { background: rgba(…quase preto…, 0.82); }

   Regra sem camada vence QUALQUER utilitário de `@layer utilities`, por mais
   específico que ele seja (armadilha nº 1 desta base). Medido no navegador com
   o CSS compilado do servidor: um `<select>` com fundo de token semântico
   ficou em **1,52:1** no tema claro — texto quase preto sobre fundo quase
   preto. É a mesma família de defeito que já derrubou os três selects da
   central de materiais.

   O que FUNCIONA sem tocar no arquivo compartilhado é `bg-white/…` e
   `border-white/…`: globals.css tem, também sem camada, um override de tema
   claro para `[class*="bg-white/"]` e `[class*="border-white/"]`. Ou seja: o
   par fundo+borda passa a virar com o tema porque é o próprio globals que o
   vira, e não um utilitário que ele engoliria.

   O RAIO também vem da base (12px) e o utilitário perde. Em vez de fingir
   outro valor, os controles desta tela adotam esse 12px — que é exatamente o
   raio de `.cc6-panel-quiet`. Uma família por superfície: 16px o painel, 12px
   o que está dentro dele, pílula só onde o objeto é pílula. */
/* SEM degrau de fonte aqui de propósito: `button, input, select, textarea
   { font: inherit }` é regra de base SEM CAMADA e vence qualquer `text-*` de
   `@layer utilities` — medido, 16px. E 16px é o valor CERTO num campo: abaixo
   disso o iOS dá zoom no foco e tira o campo da tela. Declarar `text-corpo`
   aqui só criaria uma classe que não pinta. */
const controle =
  `min-h-11 w-full border border-white/10 bg-white/[0.03] px-3 text-[var(--atlas-texto-forte)]! transition-colors ${focusRing}`;
/* Botão cru acompanha o mesmo 12px dos campos — o valor é o que a base já
   pinta, não um raio novo. */
const RAIO_CONTROLE = "rounded-[12px]";
/* Trilho de barra: `bg-white/[0.06]` é invisível sobre painel branco no tema
   claro, e sem trilho a barra só diz "tem alguma coisa". */
const TRILHO = "color-mix(in srgb, var(--atlas-texto-fraco) 22%, transparent)";

type UnidadeEstado = "available" | "reserved" | "sold" | "blocked";

/* Fonte única de rótulo, tom, faixa e forma por estado da unidade. Os quatro
   rótulos são exatamente os que a página já exibia no seletor de status. */
const ESTADO_DA_UNIDADE: Record<UnidadeEstado, {
  rotulo: string;
  tone: "info" | "warning" | "success" | "danger";
  emoji: string;
  banda: string;
}> = {
  available: { rotulo: "Disponível", tone: "info", emoji: "🔑", banda: "var(--atlas-accent)" },
  reserved: { rotulo: "Reservada", tone: "warning", emoji: "⏳", banda: "var(--atlas-estado-atencao)" },
  sold: { rotulo: "Vendida", tone: "success", emoji: "✅", banda: "var(--atlas-estado-sucesso)" },
  blocked: { rotulo: "Bloqueada", tone: "danger", emoji: "⛔", banda: "var(--atlas-estado-perigo)" },
};

const statusOptions = (Object.keys(ESTADO_DA_UNIDADE) as UnidadeEstado[]).map(
  (chave) => [chave, ESTADO_DA_UNIDADE[chave].rotulo] as const,
);

/* Os cinco rótulos de filtro são, palavra por palavra, os que a página já
   exibia — no plural, que é o que o filtro seleciona. */
const filtros: ReadonlyArray<readonly ["all" | UnidadeEstado, string]> = [
  ["all", "Todas"],
  ["available", "Disponíveis"],
  ["reserved", "Reservadas"],
  ["sold", "Vendidas"],
  ["blocked", "Bloqueadas"],
];

function estadoDaUnidade(status: string | null, reserva: Reservation | null): UnidadeEstado {
  const valor = String(status ?? "available").toLowerCase();
  if (reserva || ["reserved", "reservado"].includes(valor)) return "reserved";
  if (["sold", "vendido"].includes(valor)) return "sold";
  if (["blocked", "bloqueado"].includes(valor)) return "blocked";
  return "available";
}

/* "Reserva ativa" continua sendo dito quando há hold: é uma informação a mais
   que o estado "Reservada" não carrega (reservada na mão x hold do sistema). */
function rotuloDaUnidade(estado: UnidadeEstado, reserva: Reservation | null) {
  return reserva ? "Reserva ativa" : ESTADO_DA_UNIDADE[estado].rotulo;
}

/* ── PRAZO DA RESERVA ──────────────────────────────────────────────────────
   A rota só devolve holds com `hold_expires_at > agora`, mas a página fica
   aberta: um hold vence com o cartão na tela. As duas pontas são ditas. */
function prazoDaReserva(iso: string | null, agora: number) {
  if (!iso) return null;
  const alvo = new Date(iso).getTime();
  if (!Number.isFinite(alvo)) return null;
  const minutos = Math.round((alvo - agora) / 60_000);
  const absoluto = Math.abs(minutos);
  const quanto = absoluto >= 60
    ? `${Math.floor(absoluto / 60)} h ${absoluto % 60} min`
    : `${absoluto} min`;
  const quando = new Date(alvo).toLocaleString("pt-BR");
  /* A tinta vem do token de estado com `!`, não de `.cc6-warn`/`.cc6-crit`:
     globals.css pinta TODO `.cc6-num` de âmbar no tema claro por uma regra sem
     camada, e com isso "vencida" e "expira em" saíam da MESMA cor — medido,
     4,35:1 nos dois, abaixo do piso AA de 4,5 para 11px. Com o token: 6,3 no
     âmbar e 5,45 no vermelho, e os dois estados voltam a ser distinguíveis. */
  if (minutos <= 0) {
    return { frase: `Reserva vencida há ${quanto} · hold até ${quando}`, ink: "text-[var(--atlas-estado-perigo)]!" };
  }
  return {
    frase: `Reserva expira em ${quanto} · hold até ${quando}`,
    ink: minutos <= 10 ? "text-[var(--atlas-estado-perigo)]!" : "text-[var(--atlas-estado-atencao)]!",
  };
}

/* ── LASTRO DE PREÇO ───────────────────────────────────────────────────────
   `Number(price ?? 0)` na rota transforma unidade sem preço em zero somado.
   Aqui a ausência é CONTADA nas linhas que a própria rota devolveu, e o
   painel diz qual das três situações é a verdade. */
type LastroDePreco =
  | { estado: "completo" }
  | { estado: "parcial"; faltam: number; de: number }
  | { estado: "ausente"; de: number };

function lastroDePreco(unidades: Property[]): LastroDePreco {
  const de = unidades.length;
  const faltam = unidades.filter((unidade) => unidade.price === null || unidade.price === undefined).length;
  if (!faltam) return { estado: "completo" };
  if (faltam === de) return { estado: "ausente", de };
  return { estado: "parcial", faltam, de };
}

function SemLastro({ frase }: { frase: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-rotulo font-medium leading-6 text-[var(--atlas-texto-medio)]">
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: "color-mix(in srgb, var(--atlas-estado-atencao) 90%, transparent)" }}
      />
      <span>sem lastro</span>
      <span className="sr-only">— {frase}</span>
    </span>
  );
}

/* Célula da régua: o número medido OU "sem lastro" com o que falta escrito no
   MESMO lugar onde ficaria o detalhe. */
function Cifra({
  rotulo,
  detalhe,
  valor,
  falta,
  carregando,
  children,
}: {
  rotulo: string;
  detalhe: ReactNode;
  valor: ReactNode;
  falta?: string;
  carregando: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      {carregando ? (
        <p className="cc6-num text-numero leading-6 text-[var(--atlas-texto-fraco)]!">—</p>
      ) : falta ? (
        <SemLastro frase={falta} />
      ) : (
        <p className="cc6-num text-numero leading-6 text-[var(--atlas-texto-forte)]!">{valor}</p>
      )}
      <p className="cc6-metric-label mt-0.5 leading-4">{rotulo}</p>
      <p className="mt-0.5 text-micro leading-4 text-[var(--atlas-texto-medio)]">
        {carregando ? "lendo o espelho…" : falta ?? detalhe}
      </p>
      {children}
    </div>
  );
}

const camposDaUnidade = [
  ["unitNumber", "Unidade"],
  ["tower", "Torre/bloco"],
  ["floor", "Andar"],
  ["orientation", "Orientação"],
  ["price", "Preço atual"],
  ["listPrice", "Preço de tabela"],
] as const;

export default function DevelopmentInventoryPage() {
  const { id } = useParams<{ id: string }>();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | UnidadeEstado>("all");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [reason, setReason] = useState("Atualização operacional do espelho");
  const [newUnit, setNewUnit] = useState({ typologyId: "", unitNumber: "", tower: "", floor: "", orientation: "", price: "", listPrice: "" });
  const [agora, setAgora] = useState(() => Date.now());
  /* `loading` é só a PRIMEIRA leitura. Sem essa separação, cada mudança de
     status apagava a régua inteira para "—" por uns instantes: o número
     anterior é mais útil que um traço, e quem informa que a tela está
     buscando é o `aria-busy` mais o rótulo do próprio botão. */
  const [atualizando, setAtualizando] = useState(false);

  async function authToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  const load = useCallback(async () => {
    setAtualizando(true); setError("");
    const { data: sessao } = await supabase.auth.getSession();
    const token = sessao.session?.access_token ?? null;
    if (!token) { setError("Sessão expirada."); setLoading(false); setAtualizando(false); return; }
    const response = await fetch(`/api/v1/developments/${id}/inventory`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json() as Payload & { error?: string };
    if (!response.ok) setError(data.error || "Falha ao carregar inventário.");
    else { setPayload(data); setAgora(Date.now()); }
    setLoading(false); setAtualizando(false);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  /* O relógio só anda quando existe hold na tela: sem reserva ativa não há
     nada dependente do tempo para redesenhar. */
  const temHold = Boolean(payload?.inventory.some((unidade) => unidade.activeReservation?.hold_expires_at));
  useEffect(() => {
    if (!temHold) return;
    const timer = window.setInterval(() => setAgora(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [temHold]);

  const inventario = useMemo(() => payload?.inventory ?? [], [payload]);

  /* ── UMA TELA, UMA VERDADE ──────────────────────────────────────────────
     A rota classifica a unidade só pelos valores em inglês
     (`"reserved" | "sold" | "blocked"`, tudo o mais vira "available"); esta
     página sempre aceitou também os equivalentes em português, porque é o que
     aparece em linha antiga. Com as DUAS classificações vivas ao mesmo tempo,
     uma unidade com status em português entrava como "Vendida" no cartão e
     como "Disponível" na régua — duas verdades sobre o mesmo dado, na mesma
     tela. É a classe de defeito que esta base já catalogou como "caminhos
     divergentes".

     Agora a MESMA função classifica o cartão, o filtro, a contagem e o VGV. O
     dado continua sendo o que a rota devolveu (`payload.inventory`, linha por
     linha) — não há número novo aqui, só uma classificação em vez de duas. */
  const resumo = useMemo(() => {
    const base = {
      all: inventario.length,
      available: 0, reserved: 0, sold: 0, blocked: 0,
      totalVgv: 0, soldVgv: 0,
    };
    for (const unidade of inventario) {
      const estado = estadoDaUnidade(unidade.status, unidade.activeReservation);
      base[estado] += 1;
      const preco = Number(unidade.price ?? 0);
      base.totalVgv += preco;
      if (estado === "sold") base.soldVgv += preco;
    }
    return { ...base, absorcao: base.all ? Math.round((base.sold / base.all) * 100) : 0 };
  }, [inventario]);

  const contagens: Record<"all" | UnidadeEstado, number> = {
    all: resumo.all, available: resumo.available, reserved: resumo.reserved, sold: resumo.sold, blocked: resumo.blocked,
  };

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return inventario.filter((property) => {
      const estado = estadoDaUnidade(property.status, property.activeReservation);
      const matchFilter = filter === "all" || estado === filter;
      const haystack = [property.title, property.unit_number, property.floor, property.typology, property.bedrooms, property.area].filter(Boolean).join(" ").toLowerCase();
      return matchFilter && (!term || haystack.includes(term));
    });
  }, [inventario, query, filter]);

  const precoDoEstoque = useMemo(() => lastroDePreco(inventario), [inventario]);
  const precoDoVendido = useMemo(
    () => lastroDePreco(inventario.filter((unidade) => estadoDaUnidade(unidade.status, unidade.activeReservation) === "sold")),
    [inventario],
  );

  async function updateProperty(propertyId: string, status: string) {
    const token = await authToken();
    if (!token) { setError("Sessão expirada."); return; }
    setSavingId(propertyId); setError("");
    const response = await fetch(`/api/v1/developments/${id}/inventory`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, status, reason, expectedUpdatedAt: payload?.inventory.find((item) => item.id === propertyId)?.updated_at }),
    });
    const data = await response.json() as { error?: string };
    if (!response.ok) setError(data.error || "Falha ao atualizar unidade.");
    else await load();
    setSavingId(null);
  }

  async function createUnit() {
    const token = await authToken(); if (!token) { setError("Sessão expirada."); return; }
    setSavingId("new"); setError("");
    const response = await fetch(`/api/v1/developments/${id}/inventory`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...newUnit, floor: newUnit.floor ? Number(newUnit.floor) : null, price: Number(newUnit.price), listPrice: newUnit.listPrice ? Number(newUnit.listPrice) : null, status: "available", source: "manual", reason }) });
    const data = await response.json() as { error?: string };
    if (!response.ok) setError(data.error || "Falha ao cadastrar unidade."); else { setNewUnit({ typologyId: "", unitNumber: "", tower: "", floor: "", orientation: "", price: "", listPrice: "" }); await load(); }
    setSavingId(null);
  }

  async function reserve(propertyId: string) {
    const token = await authToken();
    if (!token) { setError("Sessão expirada."); return; }
    setSavingId(propertyId); setError("");
    const response = await fetch("/api/atlas2030/inventory/reserve", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, holdMinutes: 30, source: "launch-os.inventory" }),
    });
    const data = await response.json() as { error?: string };
    if (!response.ok) setError(data.error || "Falha ao reservar unidade.");
    else await load();
    setSavingId(null);
  }

  if (loading && !payload) {
    return (
      <div className="space-y-4 pb-10" aria-busy="true">
        <AtlasSkeleton className="h-56 w-full" />
        <AtlasSkeleton className="h-96 w-full" />
      </div>
    );
  }
  if (error && !payload) {
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
  if (!payload) return <AtlasEmpty title="Inventário indisponível" description="Não foi possível carregar as unidades deste empreendimento." />;

  const { development } = payload;
  const podeCadastrar = Boolean(newUnit.typologyId && newUnit.unitNumber && newUnit.price && reason.trim().length >= 5);

  return (
    <div className="space-y-4 pb-10" data-phase="64-canonical-sales-mirror" data-inventory-layout="decision-first" aria-busy={atualizando}>
      {/* ── 1 · COMANDO ────────────────────────────────────────────────────
          Identidade, ações e a régua de sete medições numa superfície só. O
          que eram cinco caixas com borda (herói + quatro métricas de 148px)
          é uma. */}
      <section aria-label="Resumo do espelho de vendas">
        <TiltShell className="cc6-panel cc6-reveal p-4 sm:p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="cc6-eyebrow">ESPELHO CANÔNICO</p>
              <h1 className="mt-1 max-w-2xl text-numero font-semibold leading-7 tracking-[-0.02em] text-[var(--atlas-texto-forte)]">
                {development.name}
              </h1>
              <p className="mt-1 max-w-2xl text-corpo leading-5 text-[var(--atlas-texto-medio)]">
                {development.developer_name || "Incorporadora não informada"} · {[development.neighborhood, development.city, development.state].filter(Boolean).join(" · ") || "Localização não informada"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {/* Um empreendimento, não uma varredura: aqui a palavra e o tom
                    bastam, e emoji seria decoração de título. */}
                <StatusBadge tone="info">{development.status}</StatusBadge>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link href={`/developments/${id}/inventory/import`} className="atlas-button-primary min-h-11">
                  Importar tabela
                </Link>
                <button type="button" onClick={() => void load()} disabled={atualizando} className={`cc6-ghost-btn ${focusRing}`}>
                  <span>{atualizando ? "Atualizando…" : "Atualizar dados"}</span>
                  <span aria-hidden="true">↻</span>
                </button>
                <Link href={`/developments/${id}`} className={`cc6-ghost-btn ${focusRing}`}>
                  <span aria-hidden="true">←</span>
                  <span>Voltar ao comando</span>
                </Link>
              </div>
            </div>

            {/* Absorção é o número que decide preço e ritmo neste projeto: é o
                único 34px da tela. */}
            <div className="shrink-0 lg:w-60 lg:pl-6">
              <p className="cc6-eyebrow">Absorção</p>
              <p className="cc6-metric-value mt-1 text-heroi leading-none">{resumo.absorcao}%</p>
              <p className="mt-1 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                <span className="cc6-num text-[var(--atlas-texto-medio)]!">{resumo.sold}</span> de <span className="cc6-num text-[var(--atlas-texto-medio)]!">{resumo.all}</span> unidades vendidas · contagem, não previsão
              </p>
              <div
                className="mt-2 h-1 overflow-hidden rounded-full"
                style={{ background: TRILHO }}
                role="progressbar"
                aria-label="Unidades vendidas"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={resumo.absorcao}
              >
                <div className="h-full rounded-full bg-[color:var(--atlas-accent)]" style={{ width: `${Math.min(100, Math.max(0, resumo.absorcao))}%` }} />
              </div>
            </div>
          </div>

          <div className="cc6-hairline mt-4 grid grid-cols-2 gap-x-4 gap-y-3 pt-4 sm:grid-cols-4 2xl:grid-cols-7">
            <Cifra
              rotulo="VGV do estoque"
              detalhe={`${resumo.all} unidades no espelho`}
              valor={brl.format(resumo.totalVgv)}
              falta={precoDoEstoque.estado === "ausente"
                ? `Nenhuma das ${precoDoEstoque.de} unidades tem preço cadastrado. Zero aqui seria preço ausente, não estoque sem valor.`
                : undefined}
              carregando={loading}
            >
              {precoDoEstoque.estado === "parcial" ? (
                <p className="mt-0.5 text-micro leading-4 text-[var(--atlas-estado-atencao)]!">
                  parcial · {precoDoEstoque.faltam} de {precoDoEstoque.de} sem preço
                </p>
              ) : null}
            </Cifra>
            <Cifra
              rotulo="VGV vendido"
              detalhe={`${resumo.sold} unidades concluídas`}
              valor={brl.format(resumo.soldVgv)}
              falta={precoDoVendido.estado === "ausente"
                ? `Nenhuma das ${precoDoVendido.de} unidades vendidas tem preço cadastrado.`
                : undefined}
              carregando={loading}
            >
              {precoDoVendido.estado === "parcial" ? (
                <p className="mt-0.5 text-micro leading-4 text-[var(--atlas-estado-atencao)]!">
                  parcial · {precoDoVendido.faltam} de {precoDoVendido.de} sem preço
                </p>
              ) : null}
            </Cifra>
            <Cifra rotulo="Disponíveis" detalhe="prontas para distribuição" valor={resumo.available} carregando={loading} />
            <Cifra rotulo="Reservadas" detalhe="holds e reservas ativas" valor={resumo.reserved} carregando={loading} />
            <Cifra rotulo="Vendidas" detalhe="baixa registrada no espelho" valor={resumo.sold} carregando={loading} />
            <Cifra rotulo="Bloqueadas" detalhe="fora de venda por decisão" valor={resumo.blocked} carregando={loading} />
            <Cifra rotulo="Unidades" detalhe="total conectado ao espelho" valor={resumo.all} carregando={loading} />
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

      {/* ── 3 · DECISÃO: O MAPA ───────────────────────────────────────────
          Cabeçalho e faixa de busca eram duas linhas separadas por um filete;
          viraram uma. */}
      <section className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "60ms" }} aria-labelledby="inventory-map-title">
        <header className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="cc6-eyebrow">Unit map</p>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
              <h2 id="inventory-map-title" className="text-corpo font-semibold leading-5 tracking-tight text-[var(--atlas-texto-forte)]">
                Mapa comercial de unidades
              </h2>
              <span className="cc6-chip" title="Unidades exibidas com a busca e o filtro atuais.">
                {filtered.length} de {resumo.all}
              </span>
            </div>
            <p className="mt-1 text-micro leading-4 text-[var(--atlas-texto-medio)]">
              Disponibilidade, preço, tipologia, reserva e atualização operacional em tempo real.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <label className="block min-w-0 flex-1 lg:max-w-xs">
              <span className="sr-only">Buscar unidade</span>
              {/* 16px no telefone não é escolha de escala: abaixo disso o iOS
                  dá zoom no foco e tira o campo da tela. */}
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar unidade, andar, tipologia..."
                className={controle}
              />
            </label>
            <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtros do espelho">
              {filtros.map(([chave, rotulo]) => (
                <button
                  key={chave}
                  type="button"
                  aria-pressed={filter === chave}
                  onClick={() => setFilter(chave)}
                  className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-[12px] border px-3 text-corpo! font-medium transition-colors ${
                    filter === chave
                      ? "border-[rgba(75,141,248,0.45)] bg-[rgba(75,141,248,0.08)] text-[var(--atlas-texto-forte)]"
                      : "border-[rgba(148,163,184,0.14)] bg-white/[0.02] text-[var(--atlas-texto-medio)] hover:border-[rgba(148,163,184,0.3)] hover:text-[var(--atlas-texto-forte)]"
                  } ${focusRing}`}
                >
                  <span>{rotulo}</span>
                  <span className={`cc6-num text-rotulo ${filter === chave ? "text-[var(--atlas-texto-forte)]!" : "text-[var(--atlas-texto-fraco)]!"}`}>
                    {contagens[chave]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="cc6-hairline p-4 sm:p-5">
          {filtered.length === 0 ? (
            <AtlasEmpty
              reason={resumo.all > 0 ? "no-results" : "first-use"}
              eyebrow={resumo.all > 0 ? "Busca sem correspondência" : "Espelho ainda vazio"}
              title="Nenhuma unidade encontrada"
              description="Ajuste os filtros ou cadastre o estoque do empreendimento."
              action={resumo.all > 0
                ? <button type="button" className="atlas-button-secondary min-h-11" onClick={() => { setQuery(""); setFilter("all"); }}>Limpar filtros</button>
                : undefined}
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {filtered.map((property, index) => {
                const estado = estadoDaUnidade(property.status, property.activeReservation);
                const meta = ESTADO_DA_UNIDADE[estado];
                const prazo = prazoDaReserva(property.activeReservation?.hold_expires_at ?? null, agora);
                const salvando = savingId === property.id;
                const travada = Boolean(property.activeReservation);
                return (
                  <article
                    key={property.id}
                    className="cc6-sev-band cc6-panel-quiet cc6-interativo cc6-reveal flex flex-col gap-3 py-3.5 pl-5 pr-3.5"
                    style={{ animationDelay: `${Math.min(index, 8) * 40}ms`, "--cc6-sev": meta.banda } as CSSProperties}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="cc6-metric-label leading-4">
                          {property.tower ? `${property.tower} · ` : ""}Unidade {property.unit_number || "—"} · {property.floor !== null ? `${property.floor}º andar` : "andar não informado"}
                        </p>
                        {/* Sem `truncate`: identificação de unidade cortada com
                            reticências deixa de identificar a unidade. */}
                        <h3 className="mt-1 text-corpo font-semibold leading-5 tracking-tight text-[var(--atlas-texto-forte)]">
                          {property.title || property.typology || "Unidade sem título"}
                        </h3>
                      </div>
                      <StatusBadge tone={meta.tone}>
                        <span aria-hidden="true" className="text-corpo leading-none">{meta.emoji}</span>
                        {rotuloDaUnidade(estado, property.activeReservation)}
                      </StatusBadge>
                    </div>

                    {property.price ? (
                      <p className="cc6-num text-numero leading-6 text-[var(--atlas-texto-forte)]!">{brl.format(property.price)}</p>
                    ) : (
                      <div>
                        <p className="text-corpo font-medium leading-5 text-[var(--atlas-texto-medio)]">Preço sob consulta</p>
                        <p className="text-micro leading-4 text-[var(--atlas-estado-atencao)]!">sem preço cadastrado · não entra no VGV medido</p>
                      </div>
                    )}

                    {/* Três caixas com fundo próprio dentro de um cartão que já
                        tem borda não separavam nada — e o véu escurecia a
                        superfície o bastante para derrubar o rótulo de 11,5px
                        para 3,99:1 no tema claro. Sem o véu, 4,56. Espaço no
                        lugar da caixa: a régua do v3 em uma linha. */}
                    <div className="grid grid-cols-3 gap-2">
                      {[[property.area ?? "—", "m²"], [property.bedrooms ?? "—", "dorm."], [property.parking_spaces ?? "—", "vagas"]].map(([valor, unidade]) => (
                        <div key={String(unidade)} className="min-w-0">
                          <p className="cc6-num text-corpo leading-5 text-[var(--atlas-texto-forte)]!">{valor}</p>
                          <p className="cc6-metric-label leading-4">{unidade}</p>
                        </div>
                      ))}
                    </div>

                    {prazo ? (
                      <p className={`cc6-num ${prazo.ink} text-rotulo leading-4`}>{prazo.frase}</p>
                    ) : null}

                    <div className="mt-auto grid grid-cols-[1fr_auto] gap-2">
                      <label className="block min-w-0">
                        <span className="sr-only">Status da unidade {property.unit_number || property.id}</span>
                        <select
                          disabled={salvando || travada}
                          value={estado}
                          onChange={(event) => void updateProperty(property.id, event.target.value)}
                          className={`${controle} disabled:opacity-50`}
                        >
                          {statusOptions.map(([chave, rotulo]) => <option key={chave} value={chave}>{rotulo}</option>)}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={salvando || travada || estado === "sold" || estado === "blocked"}
                        onClick={() => void reserve(property.id)}
                        /* Largura mínima fixa: o rótulo de carregamento tinha
                           3 caracteres contra 15, e o botão encolhia embaixo do
                           ponteiro no clique seguinte. */
                        className={`min-h-11 min-w-[8.5rem] ${RAIO_CONTROLE} border border-white/10 bg-white/[0.03] px-3 text-corpo! font-semibold text-[var(--atlas-estado-atencao)]! transition-colors disabled:opacity-40 ${focusRing}`}
                      >
                        {salvando ? "Reservando…" : "Reservar 30 min"}
                      </button>
                    </div>

                    {/* Auditoria da linha: o menor degrau da tela, no pé. */}
                    <p className="cc6-num cc6-hairline pt-2 text-micro leading-4 text-[var(--atlas-texto-medio)]!">
                      Versão {property.inventory_version} · disponibilidade {new Date(property.availability_updated_at).toLocaleString("pt-BR")}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── 4 · ENTRADA DE DADOS ──────────────────────────────────────────
          Desceu de segundo para quarto bloco: cadastrar unidade é retaguarda,
          e ocupava a dobra que pertence ao mapa. Os oito campos, os rótulos e
          o motivo obrigatório continuam inteiros. */}
      <section className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "100ms" }} aria-labelledby="inventory-new-title">
        <header className="p-4 sm:p-5">
          <p className="cc6-eyebrow">Unidade canônica</p>
          <h2 id="inventory-new-title" className="mt-0.5 text-corpo font-semibold leading-5 tracking-tight text-[var(--atlas-texto-forte)]">
            Cadastrar unidade
          </h2>
          <p className="mt-1 text-micro leading-4 text-[var(--atlas-texto-medio)]">
            Vincule cada unidade a uma tipologia canônica; preço e disponibilidade passam a ter versão e histórico.
          </p>
        </header>
        <div className="cc6-hairline grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
          <label className="block min-w-0">
            <span className="cc6-metric-label leading-4">Tipologia canônica</span>
            <select
              value={newUnit.typologyId}
              onChange={(event) => setNewUnit((atual) => ({ ...atual, typologyId: event.target.value }))}
              className={`${controle} mt-1`}
            >
              <option value="">Selecione</option>
              {payload.typologies.map((tipologia) => (
                <option key={tipologia.id} value={tipologia.id}>{tipologia.code} · {tipologia.name} · {tipologia.private_area} m²</option>
              ))}
            </select>
          </label>
          {camposDaUnidade.map(([chave, rotulo]) => (
            <label key={chave} className="block min-w-0">
              <span className="cc6-metric-label leading-4">{rotulo}</span>
              <input
                value={newUnit[chave]}
                onChange={(event) => setNewUnit((atual) => ({ ...atual, [chave]: event.target.value }))}
                type={["floor", "price", "listPrice"].includes(chave) ? "number" : "text"}
                className={`${controle} mt-1`}
              />
            </label>
          ))}
          <label className="block min-w-0 lg:col-span-3">
            <span className="cc6-metric-label leading-4">Motivo da alteração</span>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className={`${controle} mt-1`}
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              disabled={savingId === "new" || !podeCadastrar}
              onClick={() => void createUnit()}
              className="atlas-button-primary min-h-11 w-full disabled:opacity-40"
            >
              {savingId === "new" ? "Cadastrando…" : "Cadastrar unidade"}
            </button>
          </div>
          {!podeCadastrar ? (
            <p className="text-rotulo leading-4 text-[var(--atlas-texto-medio)] lg:col-span-4">
              Tipologia, unidade, preço e um motivo com pelo menos 5 caracteres são obrigatórios — o motivo entra no histórico da unidade.
            </p>
          ) : null}
        </div>
      </section>

      {/* ── 5 · AUDITORIA ─────────────────────────────────────────────────
          Como o espelho foi montado informa a leitura, não o que fazer: fica
          por último e recolhido. */}
      <details className="atlas-project-health cc6-panel-quiet cc6-reveal px-4 py-2" style={{ animationDelay: "140ms" }}>
        <summary className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-[12px] text-corpo font-medium text-[var(--atlas-texto-forte)] ${focusRing}`}>
          <span>Como este espelho foi apurado</span>
          <span className="cc6-num text-rotulo text-[var(--atlas-texto-medio)]!">
            {precoDoEstoque.estado === "completo" ? "VGV completo" : `${precoDoEstoque.estado === "ausente" ? precoDoEstoque.de : precoDoEstoque.faltam} sem preço`}
          </span>
        </summary>
        <p className="cc6-hairline mt-2 pt-2.5 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
          O VGV soma o preço das unidades deste empreendimento. Unidade sem preço cadastrado vale zero na soma da rota — por isso o painel conta quantas estão nessa situação e diz &quot;parcial&quot; ou &quot;sem lastro&quot; em vez de apresentar o total como medido. A absorção vem de contagem de unidades e não depende de preço.
        </p>
        <p className="mt-2 pb-1 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
          Reserva ativa trava a unidade: enquanto o hold vale, o status não pode ser alterado por aqui.
        </p>
      </details>
    </div>
  );
}
