"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasBadge, AtlasEmpty, AtlasProgress, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";

type Reservation = { id: string; status: string; hold_expires_at: string | null; lead_id: string | null; customer_id: string | null };
type Property = {
  id: string; title: string | null; unit_number: string | null; floor: number | null; typology: string | null;
  price: number | null; area: number | null; bedrooms: number | null; bathrooms: number | null;
  parking_spaces: number | null; status: string | null; updated_at: string | null; activeReservation: Reservation | null;
};
type Payload = {
  development: { id: string; name: string; developer_name: string | null; neighborhood: string | null; city: string | null; state: string | null; status: string };
  inventory: Property[];
  metrics: { total: number; available: number; reserved: number; sold: number; blocked: number; totalVgv: number; soldVgv: number; absorption: number };
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const statusOptions = [
  ["available", "Disponível"], ["reserved", "Reservada"], ["sold", "Vendida"], ["blocked", "Bloqueada"],
] as const;

function statusTone(status: string | null, reservation: Reservation | null) {
  if (reservation || ["reserved", "reservado"].includes(String(status).toLowerCase())) return "warning" as const;
  if (["sold", "vendido"].includes(String(status).toLowerCase())) return "success" as const;
  if (["blocked", "bloqueado"].includes(String(status).toLowerCase())) return "danger" as const;
  return "info" as const;
}

function statusLabel(status: string | null, reservation: Reservation | null) {
  if (reservation) return "Reserva ativa";
  return statusOptions.find(([key]) => key === String(status).toLowerCase())?.[1] ?? status ?? "Disponível";
}

export default function DevelopmentInventoryPage() {
  const { id } = useParams<{ id: string }>();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [savingId, setSavingId] = useState<string | null>(null);

  async function authToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function load() {
    setLoading(true); setError("");
    const token = await authToken();
    if (!token) { setError("Sessão expirada."); setLoading(false); return; }
    const response = await fetch(`/api/v1/developments/${id}/inventory`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json() as Payload & { error?: string };
    if (!response.ok) setError(data.error || "Falha ao carregar inventário.");
    else setPayload(data);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [id]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (payload?.inventory ?? []).filter((property) => {
      const normalized = String(property.status ?? "available").toLowerCase();
      const effective = property.activeReservation ? "reserved" : normalized;
      const matchFilter = filter === "all" || effective === filter || (filter === "available" && ["active", "ativo", "disponivel"].includes(effective));
      const haystack = [property.title, property.unit_number, property.floor, property.typology, property.bedrooms, property.area].filter(Boolean).join(" ").toLowerCase();
      return matchFilter && (!term || haystack.includes(term));
    });
  }, [payload, query, filter]);

  async function updateProperty(propertyId: string, status: string) {
    const token = await authToken();
    if (!token) { setError("Sessão expirada."); return; }
    setSavingId(propertyId); setError("");
    const response = await fetch(`/api/v1/developments/${id}/inventory`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId, status }),
    });
    const data = await response.json() as { error?: string };
    if (!response.ok) setError(data.error || "Falha ao atualizar unidade.");
    else await load();
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

  if (loading) return <div className="space-y-5"><AtlasSkeleton className="h-56 w-full" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1,2,3,4].map((value) => <AtlasSkeleton key={value} className="h-28 w-full" />)}</div></div>;
  if (error && !payload) return <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-5 text-rose-200">{error}</div>;
  if (!payload) return <AtlasEmpty title="Inventário indisponível" description="Não foi possível carregar as unidades deste empreendimento." />;

  const { development, metrics } = payload;
  return (
    <div className="space-y-6 pb-10">
      <section className="atlas-grid-glow rounded-[30px] border border-cyan-400/10 bg-gradient-to-br from-cyan-500/[.1] via-blue-500/[.06] to-violet-500/[.1] p-6 sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <Link href={`/developments/${id}`} className="text-sm font-semibold text-sky-300">← Voltar ao comando</Link>
            <div className="mt-5 flex flex-wrap gap-2"><AtlasBadge tone="violet">INVENTORY CONTROL</AtlasBadge><AtlasBadge tone="info">{development.status}</AtlasBadge></div>
            <h1 className="mt-5 text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">{development.name}</h1>
            <p className="mt-3 text-sm text-slate-400">{development.developer_name || "Incorporadora não informada"} · {[development.neighborhood, development.city, development.state].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="min-w-72 rounded-3xl border border-white/[0.08] bg-[#070d1b]/70 p-5"><div className="flex items-center justify-between"><span className="text-sm text-slate-400">Absorção</span><span className="text-3xl font-semibold text-emerald-300">{metrics.absorption}%</span></div><div className="mt-5"><AtlasProgress value={metrics.absorption} /></div></div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AtlasMetric label="VGV do estoque" value={brl.format(metrics.totalVgv)} detail={`${metrics.total} unidades`} trend="INVENTORY" tone="violet" />
        <AtlasMetric label="Disponíveis" value={String(metrics.available)} detail="prontas para distribuição" trend="SELLABLE" tone="blue" />
        <AtlasMetric label="Reservadas" value={String(metrics.reserved)} detail="holds e reservas ativas" trend="HOLD" tone="amber" />
        <AtlasMetric label="VGV vendido" value={brl.format(metrics.soldVgv)} detail={`${metrics.sold} unidades concluídas`} trend="SELL-OUT" tone="green" />
      </section>

      {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div> : null}

      <AtlasCard>
        <AtlasCardHeader eyebrow="Unit map" title="Mapa comercial de unidades" description="Disponibilidade, preço, tipologia, reserva e atualização operacional em tempo real." action={<button onClick={() => void load()} className="text-xs font-semibold text-sky-300">Atualizar ↻</button>} />
        <div className="border-t border-white/[0.06] p-5 sm:p-6">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar unidade, andar, tipologia..." className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-sm text-white outline-none transition focus:border-sky-400/30" />
            <div className="flex flex-wrap gap-2">{[["all","Todas"],["available","Disponíveis"],["reserved","Reservadas"],["sold","Vendidas"],["blocked","Bloqueadas"]].map(([key,label]) => <button key={key} onClick={() => setFilter(key)} className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${filter === key ? "border-sky-400/30 bg-sky-400/10 text-sky-200" : "border-white/[0.07] bg-white/[0.025] text-slate-400"}`}>{label}</button>)}</div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {filtered.map((property) => (
              <article key={property.id} className="rounded-3xl border border-white/[0.07] bg-[#080e1c]/75 p-5 transition hover:border-sky-400/20">
                <div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[.18em] text-slate-500">Unidade {property.unit_number || "—"} · {property.floor !== null ? `${property.floor}º andar` : "andar não informado"}</p><h3 className="mt-2 text-lg font-semibold text-white">{property.title || property.typology || "Unidade sem título"}</h3></div><AtlasBadge tone={statusTone(property.status, property.activeReservation)}>{statusLabel(property.status, property.activeReservation)}</AtlasBadge></div>
                <p className="mt-5 text-2xl font-semibold text-white">{property.price ? brl.format(property.price) : "Preço sob consulta"}</p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-slate-400"><span className="rounded-xl bg-white/[0.035] px-2 py-2">{property.area ?? "—"} m²</span><span className="rounded-xl bg-white/[0.035] px-2 py-2">{property.bedrooms ?? "—"} dorm.</span><span className="rounded-xl bg-white/[0.035] px-2 py-2">{property.parking_spaces ?? "—"} vagas</span></div>
                {property.activeReservation?.hold_expires_at ? <p className="mt-4 text-xs text-amber-300">Hold até {new Date(property.activeReservation.hold_expires_at).toLocaleString("pt-BR")}</p> : null}
                <div className="mt-5 grid grid-cols-[1fr_auto] gap-2"><select disabled={savingId === property.id || Boolean(property.activeReservation)} value={String(property.status ?? "available").toLowerCase()} onChange={(event) => void updateProperty(property.id, event.target.value)} className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-xs text-slate-200 disabled:opacity-50">{statusOptions.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select><button disabled={savingId === property.id || Boolean(property.activeReservation) || ["sold","vendido","blocked","bloqueado"].includes(String(property.status).toLowerCase())} onClick={() => void reserve(property.id)} className="rounded-xl border border-amber-400/20 bg-amber-400/[0.08] px-3 py-2 text-xs font-semibold text-amber-200 disabled:opacity-40">{savingId === property.id ? "..." : "Reservar 30 min"}</button></div>
              </article>
            ))}
          </div>
          {filtered.length === 0 ? <div className="mt-6"><AtlasEmpty title="Nenhuma unidade encontrada" description="Ajuste os filtros ou cadastre o estoque do empreendimento." /></div> : null}
        </div>
      </AtlasCard>
    </div>
  );
}
