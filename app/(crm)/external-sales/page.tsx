"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";
import { AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { lerIntencaoDaJanela, pedeCriar } from "@/lib/atlas/intencao-da-url";
import { supabase } from "@/lib/supabase";

type RecordRow = { id: string; lead_id: string; broker_id: string | null; external_company: string | null; external_project: string | null; estimated_value: number | null; purchase_date: string | null; reason_summary: string | null; evidence_status: string; director_notes: string | null; created_at: string };
type Payload = { viewer:{role:string;canReviewFinancial:boolean}; records: RecordRow[]; leads: Array<{ id: string; name: string | null; source: string | null }>; profiles: Array<{ id: string; full_name: string | null }>; candidates:Array<{id:string;name:string|null;assigned_to:string;status:string}> };

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const FIELD_CLASS = "w-full rounded-xl border border-[rgba(148,163,184,0.16)] bg-[#0b1224] px-3.5 py-2.5 text-sm text-[var(--atlas-texto-forte)] outline-none transition-colors placeholder:text-[var(--atlas-texto-fraco)] focus:border-[color:var(--atlas-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--atlas-accent)]";

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
  const [abertoParaRegistrar, setAbertoParaRegistrar] = useState(false);

  /**
   * A intenção que vinha na URL e era jogada fora.
   *
   * `lib/atlas/navigation.ts` promete "Registrar compra externa" →
   * `/external-sales?create=1`, com o resultado "classificar a perda comercial
   * com contexto". Medido em 2026-07-29: esta tela nunca leu o parâmetro. O
   * formulário de registro já nasce montado, então a promessa não estava
   * quebrada por completo — mas ele fica ABAIXO do cabeçalho e da régua de
   * números, e quem clicava no botão chegava no topo, sem nada em foco, tendo
   * que caçar o campo que já havia pedido. Promessa decorativa não aparece em
   * teste, porque a tela ABRE: só não faz o que o botão diz.
   *
   * Não abrimos caminho novo — a tela não tem estado de "criando" para ligar,
   * e inventar um duplicaria o formulário que já está sempre disponível. O que
   * a intenção faz é o que faltava: trazer o registro à vista e assumir o foco.
   *
   * A leitura vem do módulo compartilhado em vez de um `URLSearchParams` local
   * porque nove telas repetindo a mesma regra é a classe de defeito que este
   * repositório mais pagou. `create` com outro valor, parâmetro ausente ou URL
   * malformada devolvem `null` lá dentro e a tela abre exatamente como sempre
   * abriu — intenção não reconhecida nunca vira recorte silencioso.
   *
   * `window.location.search` em vez de `useSearchParams` pelo mesmo motivo de
   * `/leads`: o hook exigiria fronteira <Suspense> nesta página cliente por um
   * parâmetro, e o efeito de montagem já tem a semântica desejada — a URL
   * define o estado inicial e a pessoa assume a partir daí.
   */
  useEffect(() => {
    if (pedeCriar(lerIntencaoDaJanela())) setAbertoParaRegistrar(true);
  }, []);

  /**
   * Formulário fora da vista é o mesmo que formulário fechado. O foco roda num
   * efeito separado para acontecer DEPOIS que o aviso de "aberto pelo link"
   * entrou no DOM — senão o cálculo do centro da tela usaria uma altura que
   * muda logo em seguida. Só na chegada por link: quem abriu pelo menu continua
   * lendo a régua de números sem ter o cursor puxado.
   */
  useEffect(() => {
    if (!abertoParaRegistrar) return;
    const campo = document.getElementById("external-lead");
    if (!(campo instanceof HTMLSelectElement)) return;
    campo.scrollIntoView({ block: "center", behavior: "smooth" });
    campo.focus({ preventScroll: true });
  }, [abertoParaRegistrar]);

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
        <div className="cc6-sev-band cc6-panel-quiet py-3 pl-4 pr-3 text-sm leading-6 text-[var(--atlas-estado-perigo)]" role="alert" style={{ "--cc6-sev": "#fb7185" } as CSSProperties}>{error}</div>
      ) : null}

      {/* Formulário plano, sem rotação: registro limpo com o mínimo de campos. */}
      <section className="cc6-panel cc6-reveal p-4 sm:p-5" style={{ animationDelay: "60ms" }} aria-labelledby="external-register-title">
        <header>
          <p className="cc6-eyebrow">Registro gerencial</p>
          <h2 id="external-register-title" className="mt-1 text-lg font-semibold tracking-tight text-[var(--atlas-texto-forte)]">Marcar compra em outro lugar</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--atlas-texto-fraco)]">Selecione uma lead do seu time e preserve o motivo comercial para aprendizado.</p>
          {/* Quem chega pelo link não escolheu nada: dizer de onde veio o salto
              evita que a rolagem automática pareça a tela se mexendo sozinha, e
              deixa explícito que o registro abaixo é a tela inteira — nada da
              auditoria foi filtrado por causa do parâmetro. */}
          {abertoParaRegistrar ? (
            <p className="cc6-hairline mt-3 pt-3 text-[11px] leading-4 text-[var(--atlas-texto-fraco)]">
              <strong className="font-medium text-[var(--atlas-texto-forte)]">Registro aberto pelo link que trouxe você até aqui</strong>{" "}
              — o campo abaixo já está em foco. A auditoria comercial segue completa, sem recorte.
            </p>
          ) : null}
        </header>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <select id="external-lead" className={FIELD_CLASS} aria-label="Lead do time" value={registration.leadId} onChange={(e)=>setRegistration({...registration,leadId:e.target.value})}><option value="">Selecione a lead</option>{data?.candidates.map((lead)=><option key={lead.id} value={lead.id}>{lead.name||"Lead"}</option>)}</select>
          <input className={FIELD_CLASS} placeholder="Empresa externa (opcional)" value={registration.externalCompany} onChange={(e)=>setRegistration({...registration,externalCompany:e.target.value})}/>
          <input className={FIELD_CLASS} placeholder="Projeto comprado (opcional)" value={registration.externalProject} onChange={(e)=>setRegistration({...registration,externalProject:e.target.value})}/>
          <textarea className={`${FIELD_CLASS} min-h-20`} placeholder="Por que o cliente comprou fora?" value={registration.reason} onChange={(e)=>setRegistration({...registration,reason:e.target.value})}/>
          <div className="flex flex-wrap items-center justify-end gap-3 md:col-span-2">
            {/* O link promete um formulário utilizável. Se a lista de leads
                elegíveis vier vazia, o botão fica desabilitado sem motivo
                aparente e a pessoa conclui que o caminho está quebrado — lista
                vazia sem explicação se lê como "não há nada aqui". */}
            {!loading && data && data.candidates.length === 0 ? (
              <p className="min-w-56 flex-1 text-[11px] leading-4 text-[var(--atlas-texto-fraco)]">
                Nenhuma lead elegível no momento: a seleção traz só leads do seu time que ainda não estão como ganho nem já marcadas como compra externa.
              </p>
            ) : null}
            <button disabled={saving==="register"||!registration.leadId||registration.reason.trim().length<10} onClick={()=>void register()} className="atlas-button-primary disabled:opacity-40">Registrar perfil comprador</button>
          </div>
        </div>
      </section>

      <section className="cc6-panel cc6-reveal p-4 sm:p-5" style={{ animationDelay: "120ms" }} aria-labelledby="external-records-title">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="cc6-eyebrow">Auditoria comercial</p>
            <h2 id="external-records-title" className="mt-1 text-lg font-semibold tracking-tight text-[var(--atlas-texto-forte)]">Registro de compras externas</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--atlas-texto-fraco)]">{data?.viewer.canReviewFinancial ? "Complete empresa, projeto, valor e evidência." : "Acompanhe os perfis do seu time; campos financeiros pertencem à diretoria."}</p>
          </div>
          {!loading && data?.records.length ? <span className="cc6-chip">{data.records.length} registros</span> : null}
        </header>
        <div className="cc6-hairline mt-3" aria-busy={loading}>
          {loading ? (
            <div className="grid gap-2 py-4">{[1, 2, 3].map((row) => <AtlasSkeleton key={row} className="h-16" />)}</div>
          ) : !data?.records.length ? (
            <div className="py-4">
              <AtlasEmpty
                reason="first-use"
                eyebrow="Aprendizado ainda vazio"
                title="Nenhuma compra externa registrada"
                description="Registre uma lead do time para iniciar o aprendizado."
              />
            </div>
          ) : (
            data.records.map((item) => {
              const lead = leadMap.get(item.lead_id);
              const evidence = evidenceInfo(item.evidence_status);
              return (
                <article key={item.id} className="border-t border-[rgba(148,163,184,0.12)] py-4 first:border-t-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--atlas-texto-forte)]">{lead?.name||"Comprador externo"}</p>
                      <p className="mt-0.5 text-xs text-[var(--atlas-texto-fraco)]">{profileMap.get(item.broker_id||"")||"Sem corretor"}</p>
                    </div>
                    <StatusBadge tone={evidence.tone}>{evidence.label}</StatusBadge>
                  </div>
                  <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--atlas-texto-medio)]">{item.reason_summary||"Motivo não detalhado"}</p>
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
                    <p className="mt-2 text-xs text-[var(--atlas-texto-fraco)]">Dados financeiros restritos à diretoria.</p>
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
