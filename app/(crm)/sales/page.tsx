"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

type Opportunity = {
  id: string;
  stage: string;
  value: number | null;
  probability: number;
  expected_close_at: string | null;
  won_at: string | null;
  lost_at: string | null;
  commission_sla_days: number | null;
  commission_due_at: string | null;
  commission_received_at: string | null;
  commission_status: "not_applicable" | "pending" | "due_soon" | "overdue" | "partial" | "received" | "divergent";
  commission_net: number | null;
  commission_gross: number | null;
  commission_percentage: number | null;
  commission_split_percentage: number | null;
  commission_received_amount: number;
  leads: { name: string | null } | null;
  properties: { title: string | null } | null;
};

export default function SalesPage() {
  const [items, setItems] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [referenceTime, setReferenceTime] = useState(0);
  const [canManage, setCanManage] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
      const { data, error } = await supabase
        .from("opportunities")
        .select("id,stage,value,probability,expected_close_at,won_at,lost_at,commission_sla_days,commission_due_at,commission_received_at,commission_status,commission_gross,commission_percentage,commission_split_percentage,commission_net,commission_received_amount,leads(name),properties(title)")
        .order("created_at", { ascending: false });
      if (error) setError(error.message);
      setItems((data ?? []) as unknown as Opportunity[]);
      setReferenceTime(Date.now());
      setLoading(false);
  }

  useEffect(() => {
    void load();
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) return;
      const response = await fetch("/api/v1/auth/me", { headers: { Authorization: `Bearer ${data.session.access_token}` } });
      const body = await response.json();
      const profile = body.data?.profile;
      setCanManage(profile?.commercialRole === "director" || profile?.role === "admin");
    })();
  }, []);

  async function updateCommission(id: string, payload: Record<string, unknown>) {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) { setError("Sessão expirada. Entre novamente."); return; }
    setSavingId(id); setError("");
    try {
      const response = await fetch(`/api/v1/sales/${id}/commission`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Não foi possível atualizar a comissão.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao atualizar comissão."); }
    finally { setSavingId(null); }
  }

  function configureCommission(item: Opportunity) {
    const gross = window.prompt("Comissão bruta (R$):", String(item.commission_gross ?? "")); if (gross === null) return;
    const net = window.prompt("Comissão líquida prevista (R$):", String(item.commission_net ?? "")); if (net === null) return;
    const percentage = window.prompt("Percentual da comissão (%), se houver:", String(item.commission_percentage ?? "")); if (percentage === null) return;
    const splitPercentage = window.prompt("Percentual destinado ao corretor/time (%), se houver:", String(item.commission_split_percentage ?? "")); if (splitPercentage === null) return;
    void updateCommission(item.id, { action: "configure", gross, net, percentage: percentage || null, splitPercentage: splitPercentage || null });
  }

  function registerPayment(item: Opportunity) {
    const paymentAmount = window.prompt("Valor recebido agora (R$):"); if (paymentAmount === null) return;
    const notes = window.prompt("Observação ou identificação do pagamento (opcional):") ?? "";
    void updateCommission(item.id, { action: "payment", paymentAmount, notes });
  }

  const metrics = useMemo(() => {
    const open = items.filter((item) => !item.won_at && !item.lost_at);
    return {
      total: items.reduce((sum, item) => sum + Number(item.value ?? 0), 0),
      weighted: open.reduce((sum, item) => sum + Number(item.value ?? 0) * (item.probability / 100), 0),
      won: items.filter((item) => item.won_at).reduce((sum, item) => sum + Number(item.value ?? 0), 0),
      open: open.length,
    };
  }, [items]);

  const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);

  function liveCommissionStatus(item: Opportunity) {
    if (item.commission_status === "received" || item.commission_status === "partial" || item.commission_status === "divergent") return item.commission_status;
    if (!item.commission_due_at) return "pending";
    const remaining = new Date(item.commission_due_at).getTime() - referenceTime;
    if (remaining < 0) return "overdue";
    if (remaining <= 7 * 86_400_000) return "due_soon";
    return "pending";
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-[26px] border border-white/[.08] bg-white/[.025] p-6 pr-40">
        <Image src="/brand/atlas-robot-broker.png" alt="Robô-corretor Atlas" width={120} height={180} className="pointer-events-none absolute -bottom-12 right-5 h-auto w-28 drop-shadow-[0_18px_18px_rgba(0,0,0,.42)]" />
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">Revenue engine</p>
        <h1 className="mt-2 text-3xl font-black">Vendas e oportunidades</h1>
        <p className="mt-2 text-zinc-400">Visão consolidada do VGV, previsão ponderada e negócios em andamento.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[["VGV total", money(metrics.total)], ["Forecast ponderado", money(metrics.weighted)], ["Vendas ganhas", money(metrics.won)], ["Oportunidades abertas", String(metrics.open)]].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <p className="text-sm text-zinc-500">{label}</p>
            <p className="mt-2 text-2xl font-black">{value}</p>
          </div>
        ))}
      </div>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">{error}</div>}
      {loading ? <p className="text-zinc-400">Carregando oportunidades...</p> : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-800">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-zinc-900 text-zinc-400"><tr><th className="px-4 py-3">Lead</th><th className="px-4 py-3">Imóvel</th><th className="px-4 py-3">Etapa</th><th className="px-4 py-3">Valor</th><th className="px-4 py-3">Probabilidade</th><th className="px-4 py-3">Fechamento</th><th className="px-4 py-3">SLA comissão</th>{canManage ? <th className="px-4 py-3">Ações</th> : null}</tr></thead>
            <tbody className="divide-y divide-zinc-800 bg-zinc-950">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-4 font-medium">{item.leads?.name || "Sem lead"}</td>
                  <td className="px-4 py-4 text-zinc-400">{item.properties?.title || "Sem imóvel"}</td>
                  <td className="px-4 py-4"><span className="rounded-full bg-zinc-800 px-3 py-1 text-xs">{item.stage}</span></td>
                  <td className="px-4 py-4">{money(Number(item.value ?? 0))}</td>
                  <td className="px-4 py-4">{item.probability}%</td>
                  <td className="px-4 py-4 text-zinc-400">{item.expected_close_at ? new Date(item.expected_close_at).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-4 py-4">{item.won_at ? (() => { const status = liveCommissionStatus(item); const label = { received: "Recebida", overdue: "Atrasada", due_soon: "Vence em breve", partial: "Parcial", divergent: "Divergente", pending: "A receber", not_applicable: "A receber" }[status]; return <div><span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${status === "received" ? "bg-emerald-500/10 text-emerald-300" : ["overdue", "divergent"].includes(status) ? "bg-rose-500/10 text-rose-300" : "bg-amber-500/10 text-amber-300"}`}>{label}</span><p className="mt-2 whitespace-nowrap text-xs text-zinc-500">{item.commission_sla_days ?? 30} dias · {item.commission_due_at ? new Date(item.commission_due_at).toLocaleDateString("pt-BR") : "calculando"}</p>{item.commission_net ? <p className="mt-1 text-xs text-zinc-500">{money(item.commission_received_amount || 0)} de {money(item.commission_net)}</p> : null}</div>; })() : <span className="text-zinc-600">Após a venda</span>}</td>
                  {canManage ? <td className="px-4 py-4">{item.won_at ? <div className="flex min-w-36 flex-col gap-2"><button type="button" disabled={savingId === item.id} onClick={() => configureCommission(item)} className="atlas-button-secondary !px-3 !py-2 text-xs">Configurar</button><button type="button" disabled={savingId === item.id || !item.commission_net} onClick={() => registerPayment(item)} className="atlas-button-primary !px-3 !py-2 text-xs">Registrar recebimento</button></div> : null}</td> : null}
                </tr>
              ))}
              {!items.length && <tr><td colSpan={canManage ? 8 : 7} className="px-4 py-10 text-center text-zinc-500">Nenhuma oportunidade registrada.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
