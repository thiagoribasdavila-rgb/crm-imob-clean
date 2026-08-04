"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";
import { AtlasSkeleton } from "@/components/ui/AtlasUI";
import { supabase } from "@/lib/supabase";

/* 2026-08-02: a tela pedia a coluna "location" de properties, que NUNCA existiu.
   O PostgREST devolvia 42703, a lista vinha vazia e o corretor via o erro cru do
   banco com os quatro contadores zerados — 30 unidades e R$ 9.205.000 de VGV
   invisíveis. Conferido em information_schema.columns: a localização mora em
   neighborhood + city + state. Se um dia isso mudar de novo, o catch abaixo
   avisa em português e os contadores viram "—" em vez de zero confiante. */
type Property = {
  id: string;
  title: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  price: number | null;
  bedrooms: number | null;
  area: number | null;
  status: string | null;
};

const COLUNAS_ESTOQUE = "id, title, neighborhood, city, state, price, bedrooms, area, status";

function localizacao(item: Property) {
  const praca = [item.city, item.state].map((parte) => (parte || "").trim()).filter(Boolean).join("/");
  const partes = [(item.neighborhood || "").trim(), praca].filter(Boolean);
  return partes.length ? partes.join(" · ") : "";
}

/* Silêncio fechado: o detalhe técnico vai para o console (quem investiga precisa
   dele), e o corretor recebe uma frase que diz o que aconteceu e o que fazer. */
function mensagemDeFalha(codigo: string) {
  if (codigo === "42703" || codigo === "42P01") {
    return `O Atlas pediu ao banco um campo que não existe mais no cadastro de imóveis, então o estoque não pôde ser lido. Os números acima ficam indisponíveis até a correção — avise o suporte citando o código ${codigo}.`;
  }
  if (codigo === "42501" || codigo === "PGRST301" || codigo === "PGRST116") {
    return "Seu acesso não permite ler o estoque desta empresa. Confira com o administrador se o seu perfil está ativo.";
  }
  return `Não foi possível carregar o estoque agora. Tente novamente; se continuar assim, avise o suporte${codigo ? ` citando o código ${codigo}` : ""}.`;
}

/* CC-6: fonte única de rótulo e tom por status do estoque — antes toda unidade
   ganhava pill esmeralda, inclusive reservada ou vendida. Status desconhecido
   fica neutro com o valor cru, sem inventar semântica. */
const STATUS_INFO: Record<string, { label: string; tone: "success" | "warning" | "neutral" }> = {
  ativo: { label: "Disponível", tone: "success" },
  disponivel: { label: "Disponível", tone: "success" },
  available: { label: "Disponível", tone: "success" },
  reservado: { label: "Reservado", tone: "warning" },
  reserved: { label: "Reservado", tone: "warning" },
  vendido: { label: "Vendido", tone: "neutral" },
  sold: { label: "Vendido", tone: "neutral" },
  inativo: { label: "Inativo", tone: "neutral" },
};

function statusInfo(status: string | null) {
  const key = (status || "ativo").trim().toLowerCase();
  return STATUS_INFO[key] ?? { label: status || "ativo", tone: "neutral" as const };
}

export default function PropertiesPage() {
  const [items, setItems] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /* falhou ≠ vazio: sem essa distinção, uma leitura quebrada vira "0 imóveis"
     e "Nenhum imóvel cadastrado" — ausência de evidência virando ausência de
     dado, exatamente o que escondeu este defeito. */
  const [falhou, setFalhou] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: erroLeitura } = await supabase
        .from("properties")
        .select(COLUNAS_ESTOQUE)
        .order("updated_at", { ascending: false });

      if (erroLeitura) {
        console.error("[/properties] leitura do estoque falhou", {
          code: erroLeitura.code,
          message: erroLeitura.message,
          details: erroLeitura.details,
          hint: erroLeitura.hint,
          colunas: COLUNAS_ESTOQUE,
        });
        setError(mensagemDeFalha((erroLeitura.code || "").trim()));
        setFalhou(true);
        setItems([]);
        return;
      }

      setItems((data as Property[]) ?? []);
      setError(null);
      setFalhou(false);
    } catch (excecao) {
      console.error("[/properties] leitura do estoque lançou exceção", excecao);
      setError(mensagemDeFalha(""));
      setFalhou(true);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const available = items.filter((item) => statusInfo(item.status).tone === "success").length;
  const reserved = items.filter((item) => statusInfo(item.status).tone === "warning").length;
  const withoutPrice = items.filter((item) => !item.price).length;

  const decisive = [
    { label: "no portfólio", value: items.length, ink: "" },
    { label: "disponíveis", value: available, ink: available ? "cc6-ok" : "" },
    { label: "reservados", value: reserved, ink: reserved ? "cc6-warn" : "" },
    { label: "sob consulta", value: withoutPrice, ink: "" },
  ];

  return (
    <div className="space-y-4 pb-8">
      <PageHeader
        eyebrow="Inventário · Estoque"
        title="Imóveis"
        description="Estoque conectado ao matching inteligente do Atlas."
        /* PRIMÁRIA, e agora DECLARADA (2026-07-29): /properties não é destino do
           catálogo (é comando do ⌘K), então getAtlasNavigationContext não tem
           primaryAction para ela e a topbar cai no "Novo lead" genérico. Este é
           o único botão que carrega a ação real do estoque; rebaixá-lo deixaria
           a tela sem ação própria. */
        action={{ href: "/properties/matching", label: "✦ Abrir Matching IA", priority: "primary" }}
      />

      {/* Estoque com decisão: disponíveis e reservados na régua mono antes da
          lista. Única superfície com 3D. */}
      <section aria-label="Números decisivos do estoque">
        <TiltShell className="cc6-panel cc6-reveal p-5 sm:p-6">
          <div className="flex flex-wrap gap-x-10 gap-y-4" aria-busy={loading}>
            {decisive.map((metric) => (
              <div key={metric.label}>
                <p className={`cc6-metric-value text-2xl leading-none sm:text-3xl ${loading || falhou ? "" : metric.ink}`}>{loading || falhou ? "—" : metric.value}</p>
                <p className="cc6-metric-label mt-1.5">{metric.label}</p>
              </div>
            ))}
          </div>
        </TiltShell>
      </section>

      {error ? (
        <div className="cc6-sev-band cc6-panel-quiet py-3 pl-4 pr-3 text-sm leading-6 text-[var(--atlas-estado-perigo)]" role="alert" style={{ "--cc6-sev": "#fb7185" } as CSSProperties}>
          <p>{error}</p>
          <button
            type="button"
            onClick={() => { void load(); }}
            disabled={loading}
            className="cc6-interativo mt-2 rounded-md px-2.5 py-1 text-xs font-semibold text-[var(--atlas-texto-forte)] underline underline-offset-4 disabled:opacity-60"
          >
            {loading ? "Tentando…" : "Tentar novamente"}
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[1, 2, 3, 4, 5, 6].map((row) => <AtlasSkeleton key={row} className="h-36" />)}
        </div>
      ) : falhou ? null : items.length === 0 ? (
        <p className="cc6-reveal text-xs leading-5 text-[var(--atlas-texto-fraco)]" style={{ animationDelay: "60ms" }}>Nenhum imóvel cadastrado — o estoque publicado aparece aqui e alimenta o matching.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item, index) => {
            const status = statusInfo(item.status);
            const onde = localizacao(item);
            return (
              <article
                key={item.id}
 className="cc6-panel-quiet cc6-interativo cc6-reveal p-4"
                style={{ animationDelay: `${60 + Math.min(index, 8) * 40}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold tracking-tight text-[var(--atlas-texto-forte)]">{item.title || "Imóvel sem título"}</h2>
                    <p className="mt-0.5 text-xs leading-5 text-[var(--atlas-texto-fraco)]" title={onde || undefined}>{onde || "Localização não informada"}</p>
                  </div>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                </div>
                {item.price ? (
                  <p className="cc6-num mt-4 text-xl font-semibold text-[var(--atlas-texto-forte)]">{money.format(item.price)}</p>
                ) : (
                  <p className="mt-4 text-sm font-medium text-[var(--atlas-texto-medio)]">Sob consulta</p>
                )}
                <p className="cc6-num cc6-hairline mt-3 flex gap-4 pt-3 text-xs text-[var(--atlas-texto-medio)]">
                  <span>{item.bedrooms ?? "—"} dorm.</span>
                  <span>{item.area ?? "—"} m²</span>
                </p>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
