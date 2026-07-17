"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Approval = { id: string; request_type: string; entity_type: string; status: string; decision_reason: string | null; expires_at: string | null; created_at: string; leadName: string; brokerName: string; channel: string; preview: string };

export default function ApprovalsPage() {
  const [items, setItems] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  async function load() {
    const session = await supabase.auth.getSession();
    const response = await fetch("/api/v2/approvals", { headers: { Authorization: `Bearer ${session.data.session?.access_token || ""}` }, cache: "no-store" });
    const body = await response.json();
    if (response.ok) { setItems(body.data.items); setError(""); } else setError(body.error?.message || "Não foi possível carregar aprovações.");
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function decide(id: string, status: "approved" | "rejected") {
    setBusy(id);
    const session = await supabase.auth.getSession();
    const response = await fetch(`/api/v2/approvals/${id}`, { method: "POST", headers: { Authorization: `Bearer ${session.data.session?.access_token || ""}`, "Content-Type": "application/json" }, body: JSON.stringify({ decision: status, reason: reasons[id] || "" }) });
    const body = await response.json();
    if (!response.ok) setError(body.error || "Não foi possível decidir esta aprovação.");
    await load();
    setBusy(null);
  }

  return <div className="space-y-8"><header><p className="atlas-eyebrow">Fase 42 · Human-in-the-loop</p><h1 className="mt-3 text-3xl font-semibold tracking-[-.04em]">Aprovação de abordagens</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Somente mensagens aprovadas entram na outbox. O gerente vê apenas abordagens dos corretores diretamente subordinados.</p></header>{error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div> : null}<section className="atlas-panel overflow-hidden"><div className="divide-y divide-white/[0.06]">{!loading&&items.length===0?<div className="p-10 text-center text-sm text-slate-500">Nenhuma abordagem pendente ou histórica.</div>:null}{items.map(item=><article key={item.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_.8fr_auto] lg:items-center"><div><p className="text-xs uppercase tracking-[.14em] text-amber-300">{item.channel} · {item.request_type}</p><h2 className="mt-2 font-semibold text-white">{item.leadName}</h2><p className="mt-1 text-xs text-slate-500">Corretor: {item.brokerName} · {new Date(item.created_at).toLocaleString("pt-BR")}</p><p className="mt-3 line-clamp-3 text-sm text-slate-400">{item.preview}</p></div><div><textarea value={reasons[item.id] || ""} onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))} disabled={item.status!=="pending"} placeholder="Motivo obrigatório para rejeitar" className="min-h-20 w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-sm text-white outline-none disabled:opacity-40" maxLength={500} /></div><div><span className="block rounded-full bg-white/[0.05] px-3 py-1 text-center text-[10px] uppercase text-slate-400">{item.status}</span>{item.status==="pending"?<div className="mt-3 flex gap-2"><button disabled={busy===item.id || (reasons[item.id] || "").trim().length < 5} onClick={()=>decide(item.id,"rejected")} className="atlas-button-secondary px-4 py-2 text-xs disabled:opacity-40">Rejeitar</button><button disabled={busy===item.id} onClick={()=>decide(item.id,"approved")} className="atlas-button-primary px-4 py-2 text-xs">Aprovar e enfileirar</button></div>:null}</div></article>)}</div></section></div>;
}
