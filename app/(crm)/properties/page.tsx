"use client";

import { useEffect, useState } from "react";
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-300">Inventory Intelligence</p>
          <h1 className="mt-2 text-3xl font-black">Imóveis</h1>
          <p className="mt-2 text-zinc-400">Estoque conectado ao matching inteligente do Atlas.</p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
          {items.length} imóveis no portfólio
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">{error}</div>}

      {loading ? (
        <div className="rounded-2xl border border-zinc-800 p-8 text-zinc-400">Carregando estoque...</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold">{item.title || "Imóvel sem título"}</h2>
                  <p className="mt-1 text-sm text-zinc-400">{item.location || item.city || "Localização não informada"}</p>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">{item.status || "ativo"}</span>
              </div>
              <p className="mt-6 text-2xl font-black">{item.price ? money.format(item.price) : "Sob consulta"}</p>
              <div className="mt-4 flex gap-4 text-sm text-zinc-400">
                <span>{item.bedrooms ?? "—"} dorm.</span>
                <span>{item.area ?? "—"} m²</span>
              </div>
            </article>
          ))}
          {items.length === 0 && <div className="rounded-2xl border border-zinc-800 p-8 text-zinc-400">Nenhum imóvel cadastrado.</div>}
        </div>
      )}
    </div>
  );
}
