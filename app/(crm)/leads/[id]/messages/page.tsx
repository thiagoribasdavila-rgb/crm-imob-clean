"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasBadge, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader } from "@/components/ui/AtlasCard";

type Lead = { id: string; name: string | null; phone: string | null; email: string | null; status: string | null; score: number | null; temperature: string | null };
type Development = { id: string; name: string; developer_name: string | null };
type Draft = { content: string; channel: "whatsapp" | "email"; objective: string; tone: string; mode: "generative" | "local-fallback"; warnings: string[]; requiresHumanApproval: boolean };

export default function LeadMessages() {
  const { id } = useParams<{ id: string }>();
  const [lead, setLead] = useState<Lead | null>(null);
  const [developments, setDevelopments] = useState<Development[]>([]);
  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [objective, setObjective] = useState("retomar contato e entender o momento de compra");
  const [tone, setTone] = useState("consultivo");
  const [projectId, setProjectId] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function token() {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error("Sessão expirada.");
    return data.session.access_token;
  }

  useEffect(() => {
    async function load() {
      try {
        const accessToken = await token();
        const [leadResponse, developmentResult] = await Promise.all([
          fetch(`/api/v1/leads/${id}`, { headers: { Authorization: `Bearer ${accessToken}` } }),
          supabase.from("crm_projects").select("id,name,developer_name").order("name").limit(200),
        ]);
        const payload = await leadResponse.json();
        if (!leadResponse.ok) throw new Error(payload.error || "Lead não encontrado.");
        setLead(payload.lead as Lead);
        setDevelopments((developmentResult.data ?? []) as Development[]);
      } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Falha ao carregar contexto."); }
      finally { setLoading(false); }
    }
    void load();
  }, [id]);

  async function generateDraft() {
    setGenerating(true); setError(""); setNotice("");
    try {
      const accessToken = await token();
      const response = await fetch(`/api/v1/leads/${id}/message-draft`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ channel, objective, tone, projectId: projectId || undefined }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível criar o rascunho.");
      setDraft(payload.draft as Draft);
      setContent(payload.draft.content);
    } catch (draftError) { setError(draftError instanceof Error ? draftError.message : "Falha ao criar rascunho."); }
    finally { setGenerating(false); }
  }

  async function copyDraft() {
    await navigator.clipboard.writeText(content);
    setNotice("Rascunho copiado. Revise antes de enviar.");
  }

  const whatsappUrl = lead?.phone ? `https://wa.me/${lead.phone.replace(/\D/g, "")}?text=${encodeURIComponent(content)}` : "#";
  const emailUrl = lead?.email ? `mailto:${lead.email}?body=${encodeURIComponent(content)}` : "#";

  if (loading) return <div className="space-y-5"><AtlasSkeleton className="h-44 w-full" /><AtlasSkeleton className="h-96 w-full" /></div>;

  return (
    <div className="space-y-6 pb-10">
      <section className="atlas-grid-glow overflow-hidden rounded-[30px] border border-cyan-400/10 bg-gradient-to-br from-cyan-500/[.12] via-blue-500/[.07] to-violet-500/[.12] p-6 sm:p-8"><Link href={`/leads/${id}`} className="text-xs font-semibold text-sky-300">← Voltar ao Lead 360</Link><div className="mt-5 flex flex-wrap gap-2"><AtlasBadge tone="info">MESSAGE COPILOT</AtlasBadge><AtlasBadge tone="success">APROVAÇÃO HUMANA</AtlasBadge><AtlasBadge tone="violet">REAL ESTATE</AtlasBadge></div><h1 className="mt-5 text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">Mensagem certa, com contexto e sem promessas arriscadas.</h1><p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">Crie um rascunho para {lead?.name || "o cliente"}, edite livremente e escolha quando copiar ou abrir no canal. O Atlas nunca envia sozinho.</p></section>
      {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">{notice}</div> : null}
      <section className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
        <AtlasCard><AtlasCardHeader eyebrow="Contexto da abordagem" title="O que você quer fazer?" description="A IA usa somente os dados autorizados deste lead." /><div className="space-y-4 p-5 sm:p-6"><label className="space-y-2 text-xs text-slate-400">Canal<select value={channel} onChange={(event) => setChannel(event.target.value as "whatsapp" | "email")} className="block w-full rounded-xl border border-white/10 bg-[#0a1120] px-4 py-3 text-sm text-white"><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option></select></label><label className="space-y-2 text-xs text-slate-400">Objetivo<textarea value={objective} onChange={(event) => setObjective(event.target.value)} maxLength={200} rows={3} className="block w-full resize-none rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white" /></label><label className="space-y-2 text-xs text-slate-400">Tom<select value={tone} onChange={(event) => setTone(event.target.value)} className="block w-full rounded-xl border border-white/10 bg-[#0a1120] px-4 py-3 text-sm text-white"><option value="consultivo">Consultivo</option><option value="direto">Direto</option><option value="acolhedor">Acolhedor</option><option value="executivo">Executivo</option></select></label><label className="space-y-2 text-xs text-slate-400">Projeto relacionado<select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="block w-full rounded-xl border border-white/10 bg-[#0a1120] px-4 py-3 text-sm text-white"><option value="">Nenhum projeto específico</option>{developments.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.developer_name || "Incorporadora"}</option>)}</select></label><button type="button" onClick={generateDraft} disabled={generating || !objective.trim()} className="atlas-button-primary w-full">{generating ? "Criando abordagem..." : "✦ Gerar rascunho"}</button></div></AtlasCard>
        <AtlasCard><AtlasCardHeader eyebrow="Rascunho editável" title="Revise antes de usar" description="Preço, estoque, crédito e condições sempre precisam de validação." action={draft ? <AtlasBadge tone={draft.mode === "generative" ? "success" : "warning"}>{draft.mode === "generative" ? "IA GENERATIVA" : "MOTOR LOCAL"}</AtlasBadge> : null} /><div className="p-5 sm:p-6">{!draft ? <div className="grid min-h-80 place-items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.015] p-8 text-center"><div><span className="text-4xl text-sky-300">✦</span><p className="mt-4 font-semibold text-white">O rascunho aparecerá aqui</p><p className="mt-2 text-sm text-slate-500">Escolha canal, objetivo, tom e projeto.</p></div></div> : <><textarea value={content} onChange={(event) => setContent(event.target.value)} rows={14} className="w-full resize-y rounded-2xl border border-sky-400/15 bg-slate-950/60 p-4 text-sm leading-7 text-slate-200 outline-none focus:border-sky-400/40" /><div className="mt-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.06] p-3 text-xs leading-5 text-amber-100">Revise nomes, valores, disponibilidade e condições. O conteúdo só sai do Atlas quando você escolher uma ação.</div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={copyDraft} className="atlas-button-primary">Copiar texto</button>{channel === "whatsapp" ? <a href={whatsappUrl} target="_blank" rel="noreferrer" aria-disabled={!lead?.phone} className="atlas-button-secondary">Abrir WhatsApp</a> : <a href={emailUrl} aria-disabled={!lead?.email} className="atlas-button-secondary">Abrir e-mail</a>}<button type="button" onClick={generateDraft} className="atlas-button-secondary">Gerar outra versão</button></div></>}</div></AtlasCard>
      </section>
    </div>
  );
}
