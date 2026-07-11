"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Development = {
  id: string;
  name: string;
  developer_name: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  status: string;
  delivery_date: string | null;
};

export default function DevelopmentsPage() {
  const [items, setItems] = useState<Development[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("developments")
        .select("id,name,developer_name,neighborhood,city,state,status,delivery_date")
        .order("created_at", { ascending: false });
      if (error) setError(error.message);
      setItems((data ?? []) as Development[]);
      setLoading(false);
    }
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">Portfólio imobiliário</p>
        <h1 className="mt-2 text-3xl font-black">Empreendimentos</h1>
        <p className="mt-2 text-zinc-400">Central de incorporadoras, projetos, localização, entrega e disponibilidade.</p>
      </div>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">{error}</div>}
      {loading ? <p className="text-zinc-400">Carregando empreendimentos...</p> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold">{item.name}</h2>
                  <p className="mt-1 text-sm text-zinc-400">{item.developer_name || "Incorporadora não informada"}</p>
                </div>
                <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs text-blue-300">{item.status}</span>
              </div>
              <p className="mt-5 text-sm text-zinc-300">{[item.neighborhood, item.city, item.state].filter(Boolean).join(" · ") || "Localização não informada"}</p>
              <p className="mt-2 text-xs text-zinc-500">Entrega: {item.delivery_date ? new Date(item.delivery_date).toLocaleDateString("pt-BR") : "a definir"}</p>
            </article>
          ))}
          {!items.length && <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-zinc-500 md:col-span-2 xl:col-span-3">Nenhum empreendimento cadastrado.</div>}
        </div>
      )}
    </div>
  );
}
