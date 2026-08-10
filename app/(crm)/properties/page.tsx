"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AtlasEmpty,
  AtlasRecoverableError,
  AtlasSkeleton,
} from "@/components/ui/AtlasUI";
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) {
        throw new Error("Sessão expirada. Entre novamente.");
      }
      const response = await fetch("/api/v1/properties?limit=500", {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload.error?.message || "Não foi possível carregar o portfólio.",
        );
      }
      setItems((payload.data?.items ?? []) as Property[]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar o portfólio.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-300">Inventory Intelligence</p>
          <h1 className="mt-2 text-3xl font-black">Imóveis</h1>
          <p className="mt-2 text-zinc-400">Estoque conectado ao matching inteligente do Atlas.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/properties/matching" className="atlas-button-primary">✦ Abrir Matching IA</Link>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-300">{items.length} imóveis no portfólio</div>
        </div>
      </div>

      {error ? (
        <AtlasRecoverableError
          title="Portfólio temporariamente indisponível"
          description={error}
          onRetry={() => void load()}
          busy={loading}
        />
      ) : null}

      {loading ? (
        <section aria-label="Carregando portfólio" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <AtlasSkeleton key={index} className="h-48 w-full" />
          ))}
        </section>
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
          {items.length === 0 ? (
            <div className="md:col-span-2 xl:col-span-3">
              <AtlasEmpty
                title="Nenhum imóvel no portfólio"
                description="Cadastre ou importe o estoque do primeiro empreendimento para liberar o matching."
                reason="first-use"
                action={<Link href="/developments" className="atlas-button-primary">Abrir empreendimentos</Link>}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
