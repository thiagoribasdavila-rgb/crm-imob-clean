"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";
import { AtlasSkeleton } from "@/components/ui/AtlasUI";
import { supabase } from "@/lib/supabase";

type RecordRow = { id: string; lead_id: string; broker_id: string | null; external_company: string | null; external_project: string | null; estimated_value: number | null; purchase_date: string | null; reason_summary: string | null; evidence_status: string; director_notes: string | null; created_at: string };
type Payload = { viewer:{role:string;canReviewFinancial:boolean}; records: RecordRow[]; leads: Array<{ id: string; name: string | null; source: string | null }>; profiles: Array<{ id: string; full_name: string | null }>; candidates:Array<{id:string;name:string|null;assigned_to:string;status:string}> };

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const FIELD_CLASS = "w-full rounded-xl border border-[rgba(148,163,184,0.16)] bg-[#0b1224] px-3.5 py-2.5 text-sm text-[#e8eef8] outline-none transition-colors placeholder:text-[#6b7890] focus:border-[color:var(--atlas-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--atlas-accent)]";

/* CC-6: fonte única de rótulo e tom por status de evidência — badge da linha e
   opções do select derivam daqui (antes o badge exibia o valor cru em inglês). */
const EVIDENCE: Record<string, { label: string; tone: "warning" | "info" | "success" | "neutral" }> = {
  declared: { label: "Declarada", tone: "warning" },
  reviewing: { label: "Em revisão", tone: "info" },
  verified: { label: "Verificada", tone: "success" },
  discarded: { label: "Descartada", tone: "neutral" },
};
const evidenceInfo = (status: string) => EVIDENCE[status] ?? { label: status, tone: "warning" as const };

export default function ExternalSalesPage() {
  const [data, setData] = useState<Payload | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [saving, setSaving] = useState("");
  const [registration,setRegistration]=useState({leadId:"",reason:"",externalCompany:"",externalProject:""});
  const load = useCallback(async () => { const token = (await supabase.auth.getSession()).data.session?.access_token || ""; const response = await fetch("/api/v1/crm/external-sales", { headers: { Authorization: `Bearer ${token}` } }); const result = await response.json(); if (!response.ok) setError(result.error?.message || "Falha ao carregar."); else setData(result.data); setLoading(false); }, []);
  useEffect(() => { void load(); }, [load]);
  const leadMap = useMemo(() => new Map((data?.leads ?? []).map((item) => [item.id, item])), [data]); const profileMap = useMemo(() => new Map((data?.profiles ?? []).map((item) => [item.id, item.full_name || "Corretor"])), [data]);
  const verified = data?.records.filter((item) => item.evidence_status === "verified") ?? []; const value = verified.reduce((sum, item) => sum + Number(item.estimated_value || 0), 0); const pending = data?.records.filter((item) => ["declared", "reviewing"].includes(item.evidence_status)).length ?? 0;
  async function save(item: RecordRow) { setSaving(item.id); const token = (await supabase.auth.getSession()).data.session?.access_token || ""; const response = await fetch("/api/v1/crm/external-sales", { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, externalCompany: item.external_company, externalProject: item.external_project, estimatedValue: item.estimated_value, purchaseDate: item.purchase_date, evidenceStatus: item.evidence_status, directorNotes: item.director_notes }) }); const result = await response.json(); if (!response.ok) setError(result.error?.message || "Falha ao salvar."); else await load(); setSaving(""); }
  async function register(){setSaving("register");setError("");const token=(await supabase.auth.getSession()).data.session?.access_token||"";const response=await fetch("/api/v1/crm/external-sales",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(registration)});const result=await response.json();if(!response.ok)setError(result.error?.message||"Falha ao registrar.");else{setRegistration({leadId:"",reason:"",externalCompany:"",externalProject:""});await load();}setSaving("");}
  function change(id: string, field: keyof RecordRow, value: string | number | null) { setData((current) => current ? { ...current, records: current.records.map((item) => item.id === id ? { ...item, [field]: value } : item) } : current); }

  const decisive = [
    { label: "compradores externos", value: String(data?.records.length ?? 0), ink: "" },
    { label: "aguardando validação", value: String(pending), ink: pending > 0 ? "cc6-warn" : "" },
    { label: "valor externo estimado", value: data?.viewer.canReviewFinancial ? brl.format(value) : "Restrito", ink: "" },
  ];

  return (
    <div className="space-y-4 pb-10">
      <PageHeader
        eyebrow="Fase 43 · Perfil comprador externo"
        title="Vendas realizadas fora da plataforma"
        description="Registro de aprendizado comercial: não soma receita, comissão nem conversão própria — informações financeiras são visíveis e validadas somente pela diretoria."
      />

      {/* Números do registro em uma régua mono — única superfície com 3D. */}
      <section aria-label="Resumo das compras externas">
        <TiltShell className="cc6-panel cc6-reveal p-5 sm:p-6">
          <div className="flex flex-wrap gap-x-10 gap-y-4" aria-busy={loading}>
            {decisive.map((metric) => (
              <div key={metric.label}>
                <p className={`cc6-metric-value text-2xl leading-none sm:text-3xl ${loading ? "" : metric.ink}`}>{loading ? "—" : metric.value}</p>
                <p className="cc6-metric-label mt-1.5">{metric.label}</p>
              </div>
            ))}
          </div>
        </TiltShell>
      </section>

      {error ? (
        <div className="cc6-sev-band cc6-panel-quiet py-3 pl-4 pr-3 text-sm leading-6 text-[#fb7185]" role="alert" style={{ "--cc6-sev": "#fb7185" } as CSSProperties}>{error}</div>
      ) : null}

      {/* Formulário plano, sem rotação: registro limpo com o mínimo de campos. */}
      <section className="cc6-panel cc6-reveal p-4 sm:p-5" style={{ animationDelay: "60ms" }} aria-labelledby="external-register-title">
        <header>
          <p className="cc6-eyebrow">Registro gerencial</p>
          <h2 id="external-register-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Marcar compra em outro lugar</h2>
          <p className="mt-1 text-xs leading-5 text-[#6b7890]">Selecione uma lead do seu time e preserve o motivo comercial para aprendizado.</p>
        </header>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <select className={FIELD_CLASS} aria-label="Lead do time" value={registration.leadId} onChange={(e)=>setRegistration({...registration,leadId:e.target.value})}><option value="">Selecione a lead</option>{data?.candidates.map((lead)=><option key={lead.id} value={lead.id}>{lead.name||"Lead"}</option>)}</select>
          <input className={FIELD_CLASS} placeholder="Empresa externa (opcional)" value={registration.externalCompany} onChange={(e)=>setRegistration({...registration,externalCompany:e.target.value})}/>
          <input className={FIELD_CLASS} placeholder="Projeto comprado (opcional)" value={registration.externalProject} onChange={(e)=>setRegistration({...registration,externalProject:e.target.value})}/>
          <textarea className={`${FIELD_CLASS} min-h-20`} placeholder="Por que o cliente comprou fora?" value={registration.reason} onChange={(e)=>setRegistration({...registration,reason:e.target.value})}/>
          <div className="flex justify-end md:col-span-2">
            <button disabled={saving==="register"||!registration.leadId||registration.reason.trim().length<10} onClick={()=>void register()} className="atlas-button-primary disabled:opacity-40">Registrar perfil comprador</button>
          </div>
        </div>
      </section>

      <section className="cc6-panel cc6-reveal p-4 sm:p-5" style={{ animationDelay: "120ms" }} aria-labelledby="external-records-title">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="cc6-eyebrow">Auditoria comercial</p>
            <h2 id="external-records-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Registro de compras externas</h2>
            <p className="mt-1 text-xs leading-5 text-[#6b7890]">{data?.viewer.canReviewFinancial ? "Complete empresa, projeto, valor e evidência." : "Acompanhe os perfis do seu time; campos financeiros pertencem à diretoria."}</p>
          </div>
          {!loading && data?.records.length ? <span className="cc6-chip">{data.records.length} registros</span> : null}
        </header>
        <div className="cc6-hairline mt-3" aria-busy={loading}>
          {loading ? (
            <div className="grid gap-2 py-4">{[1, 2, 3].map((row) => <AtlasSkeleton key={row} className="h-16" />)}</div>
          ) : !data?.records.length ? (
            <p className="py-4 text-xs leading-5 text-[#6b7890]">Nenhuma compra externa registrada — registre uma lead do time para iniciar o aprendizado.</p>
          ) : (
            data.records.map((item) => {
              const lead = leadMap.get(item.lead_id);
              const evidence = evidenceInfo(item.evidence_status);
              return (
                <article key={item.id} className="border-t border-[rgba(148,163,184,0.12)] py-4 first:border-t-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#e8eef8]">{lead?.name||"Comprador externo"}</p>
                      <p className="mt-0.5 text-xs text-[#6b7890]">{profileMap.get(item.broker_id||"")||"Sem corretor"}</p>
                    </div>
                    <StatusBadge tone={evidence.tone}>{evidence.label}</StatusBadge>
                  </div>
                  <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[#aab6ca]">{item.reason_summary||"Motivo não detalhado"}</p>
                  {data?.viewer.canReviewFinancial ? (
                    <div>
                      <div className="mt-3 grid gap-3 md:grid-cols-5">
                        <input className={FIELD_CLASS} value={item.external_company||""} onChange={(e)=>change(item.id,"external_company",e.target.value)} placeholder="Empresa"/>
                        <input className={FIELD_CLASS} value={item.external_project||""} onChange={(e)=>change(item.id,"external_project",e.target.value)} placeholder="Projeto"/>
                        <input type="number" className={`${FIELD_CLASS} cc6-num`} value={item.estimated_value??""} onChange={(e)=>change(item.id,"estimated_value",e.target.value?Number(e.target.value):null)} placeholder="Valor"/>
                        <input type="date" className={`${FIELD_CLASS} cc6-num`} aria-label="Data da compra" value={item.purchase_date||""} onChange={(e)=>change(item.id,"purchase_date",e.target.value||null)}/>
                        <select className={FIELD_CLASS} aria-label="Status da evidência" value={item.evidence_status} onChange={(e)=>change(item.id,"evidence_status",e.target.value)}>{Object.entries(EVIDENCE).map(([key, option]) => <option key={key} value={key}>{option.label}</option>)}</select>
                      </div>
                      <textarea className={`${FIELD_CLASS} mt-3`} value={item.director_notes||""} onChange={(e)=>change(item.id,"director_notes",e.target.value)} placeholder="Notas da diretoria"/>
                      <div className="mt-3 text-right">
                        <button disabled={saving===item.id} onClick={()=>void save(item)} className="atlas-button-primary disabled:opacity-40">{saving===item.id?"Validando...":"Validar registro"}</button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-[#6b7890]">Dados financeiros restritos à diretoria.</p>
                  )}
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
