"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";
import { AtlasSkeleton } from "@/components/ui/AtlasUI";
import { supabase } from "@/lib/supabase";

type Property = {
  id: string;
  title: string | null;
  location: string | null;
  city: string | null;
  price: number | null;
  bedrooms: number | null;
  area: number | null;
  status: string | null;
};

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

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("properties")
        .select("id, title, location, city, price, bedrooms, area, status")
        .order("updated_at", { ascending: false });

      if (error) setError(error.message);
      setItems((data as Property[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

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
        action={{ href: "/properties/mtching", label: "✦ Abrir Matching IA" }}
      />

      {/* Estoque com decisão: disponíveis e reservados na régua mono antes da
          lista. Única superfície com 3D. */}
      <section aria-label="Números decisivos do estoque">
        <TiltShell className="cc6-panel cc6-reveal p-5 sm:p-6">
          <div className="flex flex-wrap gap-x-10 gap-y-4" aria-busy={loading}>
            {decisive.map((metric) => (
              <div key={metric.label}>
                <p className={`cc6-metric-value text-2xl leading-none sm:text-3xl ${loading ? "" : metric.ink}`}>{loading ? "—" : metric.value}</p>
                <p className="cc6-metric-label mt-1.5">{metric.label}</p>
              </div>
            ))}
          </div>
        </TiltShell>
      </section>

      {error ? (
        <div className="cc6-sev-band cc6-panel-quiet py-3 pl-4 pr-3 text-sm leading-6 text-[#fb7185]" role="alert" style={{ "--cc6-sev": "#fb7185" } as CSSProperties}>{error}</div>
      ) : null}

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[1, 2, 3, 4, 5, 6].map((row) => <AtlasSkeleton key={row} className="h-36" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="cc6-reveal text-xs leading-5 text-[#6b7890]" style={{ animationDelay: "60ms" }}>Nenhum imóvel cadastrado — o estoque publicado aparece aqui e alimenta o matching.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item, index) => {
            const status = statusInfo(item.status);
            return (
              <article
                key={item.id}
                className="cc6-panel-quiet cc6-reveal p-4 transition-colors hover:border-[rgba(148,163,184,0.28)]"
                style={{ animationDelay: `${60 + Math.min(index, 8) * 40}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold tracking-tight text-[#e8eef8]">{item.title || "Imóvel sem título"}</h2>
                    <p className="mt-0.5 text-xs leading-5 text-[#6b7890]">{item.location || item.city || "Localização não informada"}</p>
                  </div>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                </div>
                {item.price ? (
                  <p className="cc6-num mt-4 text-xl font-semibold text-[#e8eef8]">{money.format(item.price)}</p>
                ) : (
                  <p className="mt-4 text-sm font-medium text-[#aab6ca]">Sob consulta</p>
                )}
                <p className="cc6-num cc6-hairline mt-3 flex gap-4 pt-3 text-xs text-[#aab6ca]">
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
