"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Customer = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  profile_type: string | null;
  income: number | null;
  created_at: string;
};

export default function CustomersPage() {
  const [items, setItems] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("customers")
        .select("id, full_name, email, phone, profile_type, income, created_at")
        .order("created_at", { ascending: false });

      if (error) setError(error.message);
      setItems((data as Customer[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-300">Customer Intelligence</p>
        <h1 className="mt-2 text-3xl font-black">Clientes</h1>
        <p className="mt-2 text-zinc-400">Visão 360º de compradores, investidores e proprietários.</p>
      </div>

      {error && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
        <div className="grid grid-cols-5 border-b border-zinc-800 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <span>Cliente</span><span>Contato</span><span>Perfil</span><span>Renda</span><span>Entrada</span>
        </div>
        {loading ? (
          <div className="p-8 text-zinc-400">Carregando clientes...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-zinc-400">Nenhum cliente cadastrado.</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="grid grid-cols-5 gap-4 border-b border-zinc-800/80 px-5 py-4 text-sm last:border-0">
              <strong>{item.full_name}</strong>
              <span className="text-zinc-400">{item.email || item.phone || "—"}</span>
              <span>{item.profile_type || "Comprador"}</span>
              <span>{item.income ? money.format(item.income) : "—"}</span>
              <span className="text-zinc-500">{new Date(item.created_at).toLocaleDateString("pt-BR")}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
