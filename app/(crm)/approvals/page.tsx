"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Approval = { id: string; request_type: string; entity_type: string; status: string; decision_reason: string | null; expires_at: string | null; created_at: string };

export default function ApprovalsPage() {
  const [items, setItems] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("approval_requests").select("id,request_type,entity_type,status,decision_reason,expires_at,created_at").order("created_at", { ascending: false });
    setItems((data ?? []) as Approval[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function decide(id: string, status: "approved" | "rejected") {
    setBusy(id);
    await supabase.from("approval_requests").update({ status, decided_at: new Date().toISOString() }).eq("id", id);
    await load();
    setBusy(null);
  }

  return <div className="space-y-8"><header><p className="atlas-eyebrow">Human-in-the-loop</p><h1 className="mt-3 text-3xl font-semibold tracking-[-.04em]">Aprovações</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Fila de decisões sensíveis para campanhas, disparos em massa, contratos e ações financeiras.</p></header><section className="atlas-panel overflow-hidden"><div className="divide-y divide-white/[0.06]">{!loading&&items.length===0?<div className="p-10 text-center text-sm text-slate-500">Nenhuma aprovação pendente ou histórica.</div>:null}{items.map(item=><article key={item.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center"><div className="flex-1"><p className="text-xs uppercase tracking-[.14em] text-amber-300">{item.request_type}</p><h2 className="mt-2 font-semibold text-white">{item.entity_type}</h2><p className="mt-2 text-xs text-slate-500">Criada em {new Date(item.created_at).toLocaleString("pt-BR")}</p></div><span className="rounded-full bg-white/[0.05] px-3 py-1 text-[10px] uppercase text-slate-400">{item.status}</span>{item.status==="pending"?<div className="flex gap-2"><button disabled={busy===item.id} onClick={()=>decide(item.id,"rejected")} className="atlas-button-secondary px-4 py-2 text-xs">Rejeitar</button><button disabled={busy===item.id} onClick={()=>decide(item.id,"approved")} className="atlas-button-primary px-4 py-2 text-xs">Aprovar</button></div>:null}</article>)}</div></section></div>;
}
