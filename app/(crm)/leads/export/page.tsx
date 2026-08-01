"use client";

import Link from "next/link";
import { useState } from "react";
import { Download, ShieldCheck } from "lucide-react";

export default function ExportLeadsPage() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function download() {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/v1/crm/leads/export", { cache: "no-store" });
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error || "Não foi possível exportar."); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `atlas-leads-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
      setNotice(response.headers.get("X-Atlas-Export-Truncated") === "true" ? "Arquivo gerado com o limite de 10.000 linhas. Refine a base antes de uma nova exportação." : "Arquivo gerado dentro do seu escopo de acesso.");
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Não foi possível exportar."); }
    finally { setBusy(false); }
  }

  return <div className="space-y-6 pb-12"><header className="rounded-[30px] border border-sky-400/15 bg-gradient-to-br from-sky-500/[.12] via-slate-950/80 to-violet-500/[.08] p-6 sm:p-8"><p className="text-xs font-bold uppercase tracking-[.2em] text-sky-300">Exportação governada</p><h1 className="mt-3 text-3xl font-black text-white sm:text-4xl">Leve somente o que você pode ver.</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">O arquivo respeita empresa, hierarquia e carteira. Contatos pessoais e documentos ficam fora desta exportação operacional.</p></header><section className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]"><div className="rounded-3xl border border-white/[.08] bg-white/[.025] p-6"><div className="flex items-center gap-3"><Download className="h-5 w-5 text-sky-300" /><h2 className="text-xl font-bold text-white">Arquivo CSV protegido</h2></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{["Funil e temperatura", "Score e próxima ação", "Responsável e projeto", "Orçamento informado"].map((item) => <div key={item} className="rounded-2xl border border-white/[.06] bg-black/10 p-4 text-sm text-slate-300">{item}</div>)}</div>{notice ? <div role="status" className="mt-5 rounded-xl border border-sky-400/15 bg-sky-400/[.06] p-4 text-sm text-sky-100">{notice}</div> : null}<div className="mt-6 flex flex-wrap gap-3"><button disabled={busy} onClick={() => void download()} className="rounded-xl bg-sky-400 px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-50">{busy ? "Preparando..." : "Baixar CSV do meu escopo"}</button><Link href="/leads" className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-white">Voltar às leads</Link></div></div><aside className="rounded-3xl border border-emerald-400/15 bg-emerald-400/[.045] p-6"><ShieldCheck className="h-6 w-6 text-emerald-300" /><h2 className="mt-4 text-lg font-bold text-white">Proteções ativas</h2><ul className="mt-4 space-y-3 text-sm leading-6 text-slate-400"><li>Diretor: organização inteira.</li><li>Superintendente: somente estruturas subordinadas.</li><li>Gerente: somente o próprio time.</li><li>Corretor: somente suas leads.</li><li>Fórmulas de planilha são neutralizadas.</li><li>Máximo de 10.000 registros por arquivo.</li></ul></aside></section></div>;
}
