"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { matchLeadToProperty } from "@/lib/atlas/matching";
import { supabase } from "@/lib/supabase";
import type { AtlasLead, AtlasProperty } from "@/types/atlas";
import { AtlasBadge, AtlasEmpty, AtlasProgress, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";

type LeadRow = {
  id: string; name: string | null; email: string | null; phone: string | null;
  source: string | null; status: string | null; temperature: string | null;
  score: number | null; budget_min: number | null; budget_max: number | null;
  preferred_regions: string[] | null; bedrooms: number | null; purpose: string | null;
  notes: string | null; created_at: string | null; next_action_at?: string | null;
  metadata: { meta?: { campaignId?: string; adsetId?: string; adId?: string; formId?: string; sourceName?: string; dataSharingConsent?: boolean } } | null;
};
type ActivityRow = { id: string; title: string; description: string | null; type: string; authorName?: string; metadata?: { propertyId?: string; signal?: "interested" | "rejected" } | null; occurred_at: string };
type PropertyRow = { id: string; title: string | null; price: number | null; city: string | null; state: string | null; bedrooms: number | null; bathrooms: number | null; parking_spaces: number | null; area: number | null; status: string | null };
type OpportunityRow = { id: string; stage: string; value: number | null; probability: number; expected_close_at: string | null; property_id: string | null; created_at: string };
type ExperienceRow = { id: string; severity: string; confidence: number; evidence: string; recommendation: string; suggested_reply: string | null; status: string; created_at: string };
type ProposalRow = { id: string; status: "draft"|"proposal_review"|"approved"|"rejected"|"sent"|"accepted"|"declined"|"expired"; property_price: number; valid_until: string; review_requested_at: string|null; approved_at: string|null; sent_at: string|null; responded_at: string|null; expired_at: string|null; preparation_minutes: number|null; review_minutes: number|null; response_minutes: number|null; response_note: string|null; rule_snapshot: { propertyTitle?: string; ruleName?: string; version?: number } };

type GapQuestion = { key: string; label: string; question: string; why: string; priority: "critical" | "high" | "medium"; action: "qualify" | "focus" | "navigate"; target: string; options?: Array<{ value: string; label: string }> };
type DataQuality = { completeness: number; completedFields: number; totalFields: number; missing: Array<{ key: string; label: string }>; inconsistencies: string[]; status: "review" | "complete" | "enrich"; recommendation: string; nextQuestion: GapQuestion | null; questions: GapQuestion[]; calculation: string };
type UnifiedProfile = { conversations: Array<{ id: string; status: string; channel: string; last_message_at: string | null; unread_count: number }>; tasks: Array<{ id: string; status: string; due_at: string | null; priority: string | null }>; campaignEvents: Array<{ id: string; event_type: string; occurred_at: string }>; sources: string[] };
type ContactBriefing = { unreadMessages: number; openTasks: number; activeOpportunities: number; lastInteractionAt: string | null; context: string; actions: string[]; generatedBy: string; requiresApproval: boolean };
type RelationshipContext = { owner: { id: string; full_name: string | null; commercial_role: string | null; role: string } | null; development: { id: string; name: string; developer_name: string | null; status: string | null; city: string | null } | null; campaign: { id: string; name: string; channel: string | null; status: string | null } | null; communications: { conversations: number; messages: number; inbound: number; outbound: number; unread: number; channels: string[]; lastMessageAt: string | null }; origin: { source: string; createdAt: string | null; campaignEvents: number; historicalMemories: number } };
type AssignmentReservation={id:string;broker_id:string;status:"pending"|"accepted"|"expired"|"released"|"superseded";reserved_at:string;expires_at:string;accepted_at:string|null;released_at:string|null;release_reason:string|null};
type Payload = { lead: LeadRow; activities: ActivityRow[]; properties: PropertyRow[]; opportunities: OpportunityRow[]; experienceSignals: ExperienceRow[]; proposals: ProposalRow[]; dataQuality: DataQuality; unifiedProfile: UnifiedProfile; contactBriefing: ContactBriefing; relationshipContext: RelationshipContext;assignmentReservation:AssignmentReservation|null };
type Qualification = {
  score: number; temperature: "frio" | "morno" | "quente"; confidence: number;
  dimensions: Array<{ key: string; label: string; score: number; maximum: number; reasons: string[] }>;
  strengths: string[]; missingData: string[]; risks: string[]; nextBestAction: string; recommendedQuestions: Array<{ key: string; question: string; why: string; options?: Array<{ value: string; label: string }> }>; recalculatedAt: string; progress: { answered: number; total: number; percent: number }; scoreChange: { previous: number; current: number; delta: number };
};

const inputClass = "w-full rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-sky-400/40 focus:bg-sky-400/[0.035]";
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function temperatureTone(value?: string | null): "neutral" | "success" | "warning" | "danger" | "info" | "violet" {
  if (value === "quente") return "danger";
  if (value === "morno") return "warning";
  if (value === "frio") return "info";
  return "neutral";
}

export default function LeadDetailPage() {
  const { id: leadId } = useParams<{ id: string }>();
  const [lead, setLead] = useState<LeadRow | null>(null);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);
  const [experienceSignals, setExperienceSignals] = useState<ExperienceRow[]>([]);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [dataQuality, setDataQuality] = useState<DataQuality | null>(null);
  const [unifiedProfile, setUnifiedProfile] = useState<UnifiedProfile | null>(null);
  const [contactBriefing, setContactBriefing] = useState<ContactBriefing | null>(null);
  const [relationshipContext, setRelationshipContext] = useState<RelationshipContext | null>(null);
  const [assignmentReservation,setAssignmentReservation]=useState<AssignmentReservation|null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [activityTitle, setActivityTitle] = useState("");
  const [activityDescription, setActivityDescription] = useState("");
  const [activityType, setActivityType] = useState("note");
  const [qualification, setQualification] = useState<Qualification | null>(null);
  const [qualifying, setQualifying] = useState(false);
  const [simulation, setSimulation] = useState<{ id: string; property_price: number; down_payment: number | null; financed_balance: number | null; installment_amount: number | null; installments_count: number | null; valid_until: string; rule_snapshot: { ruleName: string; version: number; paymentFlow: string; developerName: string; calculation: string; disclaimer: string; balloonPaymentNotes?: string | null; financingNotes?: string | null; ruleValidity: { from: string | null; until: string | null } } } | null>(null);

  async function api(path: string, init?: RequestInit) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessão expirada. Entre novamente.");
    const response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Falha na operação.");
    return body;
  }

  async function load() {
    setLoading(true);
    setMessage(null);
    try {
      const data = await api(`/api/v1/leads/${leadId}`) as Payload;
      setLead(data.lead);
      setActivities(data.activities);
      setProperties(data.properties);
      setOpportunities(data.opportunities);
      setExperienceSignals(data.experienceSignals ?? []);
      setProposals(data.proposals ?? []);
      setDataQuality(data.dataQuality);
      setUnifiedProfile(data.unifiedProfile);
      setContactBriefing(data.contactBriefing);
      setRelationshipContext(data.relationshipContext);
      setAssignmentReservation(data.assignmentReservation);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao carregar o lead.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [leadId]);

  const feedbackByProperty = useMemo(() => {
    const feedback = new Map<string, "interested" | "rejected">();
    for (const activity of activities) {
      const propertyId = activity.metadata?.propertyId;
      const signal = activity.metadata?.signal;
      if (activity.type === "property_feedback" && propertyId && signal && !feedback.has(propertyId)) feedback.set(propertyId, signal);
    }
    return feedback;
  }, [activities]);

  const matches = useMemo(() => {
    if (!lead) return [];
    const atlasLead: Partial<AtlasLead> = { id: lead.id, budgetMax: lead.budget_max, bedrooms: lead.bedrooms, preferredRegions: lead.preferred_regions ?? [] };
    return properties.map((property) => {
      const atlasProperty: AtlasProperty = { id: property.id, title: property.title, price: property.price, city: property.city, state: property.state, bedrooms: property.bedrooms, bathrooms: property.bathrooms, parkingSpaces: property.parking_spaces, area: property.area, status: property.status };
      return { property, match: matchLeadToProperty(atlasLead, atlasProperty, feedbackByProperty.get(property.id)) };
    }).filter((item) => item.match.score > 0).sort((a, b) => b.match.score - a.match.score).slice(0, 6);
  }, [feedbackByProperty, lead, properties]);

  const intelligence = useMemo(() => {
    if (!lead) return { readiness: 0, nextAction: "Carregando contexto...", risk: "unknown", summary: "" };
    let readiness = 20;
    if (lead.phone || lead.email) readiness += 15;
    if (lead.budget_max) readiness += 20;
    if (lead.preferred_regions?.length) readiness += 15;
    if (lead.bedrooms !== null) readiness += 10;
    if (activities.length > 0) readiness += 10;
    if (opportunities.length > 0) readiness += 10;
    readiness = Math.min(100, readiness);
    const risk = activities.length === 0 ? "alto" : opportunities.length === 0 ? "médio" : "baixo";
    const nextAction = activities.length === 0
      ? "Realizar o primeiro contato e registrar a resposta."
      : opportunities.length === 0
        ? "Apresentar o imóvel com maior aderência e abrir oportunidade."
        : "Validar objeções e avançar a oportunidade para a próxima etapa.";
    const summary = `${lead.name || "Este lead"} entrou por ${lead.source || "origem não informada"}, possui score ${lead.score ?? 0} e está na etapa ${lead.status || "novo"}. ${matches.length ? `Há ${matches.length} imóveis com aderência comercial.` : "Ainda não há imóveis compatíveis suficientes."}`;
    return { readiness, nextAction, risk, summary };
  }, [activities.length, lead, matches.length, opportunities.length]);

  async function saveLead(event: FormEvent) {
    event.preventDefault();
    if (!lead) return;
    setSaving(true); setMessage(null);
    try {
      const data = await api(`/api/v1/leads/${lead.id}`, { method: "PATCH", body: JSON.stringify(lead) });
      setLead(data.lead);
      setMessage("Lead atualizado e registrado na timeline.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function addActivity(event: FormEvent) {
    event.preventDefault();
    const title = activityTitle.trim();
    if (!title) return;
    try {
      await api(`/api/v1/leads/${leadId}`, { method: "POST", body: JSON.stringify({ action: "activity", title, description: activityDescription, type: activityType }) });
      setActivityTitle("");
      setActivityDescription("");
      setMessage("Interação registrada no histórico.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao registrar interação.");
    }
  }

  async function createOpportunity(propertyId?: string) {
    try {
      await api(`/api/v1/leads/${leadId}`, { method: "POST", body: JSON.stringify({ action: "opportunity", propertyId }) });
      setMessage("Oportunidade criada no pipeline.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao criar oportunidade.");
    }
  }

  async function acceptAssignment(){
    try{await api(`/api/v1/leads/${leadId}`,{method:"POST",body:JSON.stringify({action:"accept_assignment"})});setMessage("Lead aceita. A carteira permanece com você e o aceite foi registrado.");await load()}catch(error){setMessage(error instanceof Error?error.message:"Não foi possível aceitar a lead.")}
  }

  async function simulate(propertyId: string) {
    setMessage(null);
    try {
      const data = await api(`/api/v1/leads/${leadId}/commercial-simulation`, { method: "POST", body: JSON.stringify({ action: "simulate", propertyId }) }) as { simulation: typeof simulation; disclaimer: string };
      setSimulation(data.simulation); setMessage(data.disclaimer);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao simular."); }
  }

  async function requestProposal() {
    if (!simulation) return;
    try {
      await api(`/api/v1/leads/${leadId}/commercial-simulation`, { method: "POST", body: JSON.stringify({ action: "proposal", simulationId: simulation.id }) });
      setMessage("Proposta enviada para revisão humana de preço, estoque e condição de pagamento.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao preparar proposta."); }
  }

  async function updateProposal(simulationId: string, status: "sent"|"accepted"|"declined", note?: string) {
    try {
      await api(`/api/v1/leads/${leadId}/commercial-simulation`, { method: "POST", body: JSON.stringify({ action: "proposal_lifecycle", simulationId, status, note }) });
      setMessage(status === "sent" ? "Envio registrado; agora acompanhe o retorno dentro da validade." : status === "accepted" ? "Aceite do cliente registrado." : "Recusa registrada para aprendizado comercial.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao atualizar a proposta."); }
  }

  async function qualifyLead(answers?: Record<string, string>) {
    setQualifying(true);
    setMessage(null);
    try {
      const data = await api(`/api/v1/leads/${leadId}/qualify`, { method: "POST", body: JSON.stringify({ answers }) }) as { qualification: Qualification };
      setQualification(data.qualification);
      setLead((current) => current ? { ...current, score: data.qualification.score, temperature: data.qualification.temperature } : current);
      const answeredKeys = Object.keys(answers ?? {});
      if (answeredKeys.length) setDataQuality((current) => {
        if (!current) return current;
        const questions = current.questions.filter((question) => !answeredKeys.includes(question.key));
        return { ...current, questions, nextQuestion: questions[0] || null, completeness: Math.min(100, current.completeness + 10 * answeredKeys.length) };
      });
      setMessage("Qualificação recalibrada e registrada na timeline.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao recalibrar o lead.");
    } finally {
      setQualifying(false);
    }
  }

  function actOnGap(question: GapQuestion) {
    if (question.action === "navigate") {
      window.location.assign(question.target === "schedule" ? `/leads/${leadId}/schedule` : question.target);
      return;
    }
    const selector: Record<string, string> = { phone: 'input[placeholder="Telefone"]', budget_max: 'input[placeholder="Orçamento máximo"]', preferred_regions: 'input[placeholder="Regiões preferidas"]', bedrooms: 'input[placeholder="Dormitórios"]' };
    document.querySelector<HTMLInputElement>(selector[question.target] || "")?.focus();
  }

  if (loading) return <div className="space-y-5"><AtlasSkeleton className="h-36 w-full" /><div className="grid gap-4 md:grid-cols-3"><AtlasSkeleton className="h-28 w-full" /><AtlasSkeleton className="h-28 w-full" /><AtlasSkeleton className="h-28 w-full" /></div><AtlasSkeleton className="h-96 w-full" /></div>;
  if (!lead) return <AtlasEmpty title="Lead não encontrado" description={message || "O registro pode ter sido removido ou você não possui acesso."} action={<Link href="/leads" className="atlas-button-secondary">Voltar para leads</Link>} />;

  return (
    <div className="space-y-6 pb-10" data-phase="26-lead-360">
      <section className="atlas-grid-glow overflow-hidden rounded-[28px] border border-sky-400/10 bg-gradient-to-br from-sky-500/[.12] via-blue-500/[.05] to-violet-500/[.1] p-6 sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <Link href="/leads" className="text-xs font-semibold text-sky-300">← Voltar para leads</Link>
            <div className="mt-4 flex flex-wrap items-center gap-2"><AtlasBadge tone="info">LEAD INTELLIGENCE 360</AtlasBadge><AtlasBadge tone={temperatureTone(lead.temperature)}>{lead.temperature || "não classificado"}</AtlasBadge><AtlasBadge tone="violet">{lead.status || "novo"}</AtlasBadge></div>
            <h1 className="mt-5 text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">{lead.name || "Lead sem nome"}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">{intelligence.summary}</p>
            <div className="mt-6 flex flex-wrap gap-3"><button onClick={() => window.dispatchEvent(new CustomEvent("atlas:open-copilot", { detail: { prompt: `Analise a lead ${lead.name || "selecionada"} e recomende a próxima melhor ação.`, context: { leadId: lead.id, source: "lead_360" } } }))} className="atlas-button-primary">✦ Copiloto exclusivo</button><Link href={`/leads/${lead.id}/qualification`} className="atlas-button-primary">Qualificar agora</Link><Link href={`/leads/${lead.id}/simulation`} className="atlas-button-primary">Simular condições</Link><button onClick={() => void qualifyLead()} disabled={qualifying} className="atlas-button-secondary">{qualifying ? "Recalibrando..." : "Recalibrar com IA"}</button><Link href={`/leads/${lead.id}/prediction`} className="atlas-button-secondary">Previsão explicada</Link><Link href={`/leads/${lead.id}/memory`} className="atlas-button-secondary">Memória segura</Link><Link href={`/leads/${lead.id}/behavior`} className="atlas-button-secondary">Jornada inteligente</Link><Link href={`/leads/${lead.id}/attribution`} className="atlas-button-secondary">Origem e atribuição</Link><Link href={`/leads/${lead.id}/contact-preferences`} className="atlas-button-secondary">Consentimento</Link><Link href={`/leads/${lead.id}/messages`} className="atlas-button-secondary">✦ Criar mensagem protegida</Link><button onClick={() => void createOpportunity()} className="atlas-button-secondary">Criar oportunidade</button></div>
          </div>
          <div className="min-w-full rounded-3xl border border-white/[0.08] bg-[#070d1b]/75 p-5 backdrop-blur-xl xl:min-w-80">
            <div className="flex items-center justify-between"><div><p className="atlas-eyebrow">Readiness</p><p className="mt-2 text-xl font-semibold text-white">Prontidão comercial</p></div><span className="text-3xl font-semibold text-emerald-300">{intelligence.readiness}</span></div>
            <div className="mt-5"><AtlasProgress value={intelligence.readiness} label="Qualidade do perfil" /></div>
            <p className="mt-4 text-xs leading-5 text-slate-400">{intelligence.nextAction}</p>
          </div>
        </div>
      </section>

      {message ? <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 p-4 text-sm text-sky-100">{message}</div> : null}

      {assignmentReservation?.status==="pending"?<section data-phase="58-lead-reservation" className="flex flex-col gap-4 rounded-3xl border border-amber-400/25 bg-amber-400/[.07] p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="atlas-eyebrow text-amber-200">Fase 58 · Reserva aguardando aceite</p><h2 className="mt-2 text-lg font-semibold text-white">Confirme que você assumirá este atendimento</h2><p className="mt-1 text-xs leading-5 text-slate-400">Aceite até {new Date(assignmentReservation.expires_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}. Se houver interação registrada, a lead não será devolvida automaticamente.</p></div><button type="button" onClick={()=>void acceptAssignment()} className="atlas-button-primary">Aceitar lead</button></section>:null}

      {dataQuality?.questions.length ? <AtlasCard><div data-phase="30-data-gaps"><AtlasCardHeader eyebrow="Fase 30 · Dados úteis" title="Pergunte menos e descubra o que realmente ajuda a vender" description="As lacunas são priorizadas pelo impacto em contato, intenção, matching e continuidade. A análise local não gera custo de IA." action={<AtlasBadge tone="warning">{dataQuality.completeness}% COMPLETO</AtlasBadge>} /><div className="grid gap-3 p-5 sm:p-6 lg:grid-cols-3">{dataQuality.questions.slice(0, 6).map((question, index) => <article key={question.key} className={`rounded-2xl border p-4 ${index === 0 ? "border-cyan-300/30 bg-cyan-400/[.07]" : "border-white/[.07] bg-white/[.025]"}`}><div className="flex items-center justify-between gap-2"><AtlasBadge tone={question.priority === "critical" ? "danger" : question.priority === "high" ? "warning" : "info"}>{question.label}</AtlasBadge>{index === 0 ? <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-200">Pergunte agora</span> : null}</div><strong className="mt-3 block text-sm leading-6 text-white">{question.question}</strong><p className="mt-1 text-xs leading-5 text-slate-500">{question.why}</p>{question.options ? <div className="mt-3 flex flex-wrap gap-2">{question.options.map((option) => <button key={option.value} type="button" disabled={qualifying} onClick={() => void qualifyLead({ [question.key]: option.value })} className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-cyan-100 hover:border-cyan-400/40 disabled:opacity-50">{option.label}</button>)}</div> : <button type="button" onClick={() => actOnGap(question)} className="atlas-button-secondary mt-3">{question.action === "navigate" ? "Abrir ação" : "Preencher agora"}</button>}</article>)}</div><div className="border-t border-white/[.06] px-5 py-4 text-[11px] leading-5 text-slate-500 sm:px-6">A completude é ponderada pelo valor comercial do dado. CPF, CNPJ, endereço exato e documentos não aumentam score nem são enviados às IAs.</div></div></AtlasCard> : dataQuality?.status === "complete" ? <div data-phase="30-data-gaps" className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[.06] p-5 text-sm text-emerald-100">Perfil comercial completo. Confirme apenas mudanças naturais na próxima conversa.</div> : null}

      {relationshipContext ? <AtlasCard><AtlasCardHeader eyebrow="Fase 26 · Lead 360" title="Tudo sobre esta relação em uma única tela" description="Identidade, origem, responsável, projeto, comunicações, histórico, score e pipeline reconciliados sob o mesmo escopo comercial." action={<AtlasBadge tone="success">FONTE ÚNICA</AtlasBadge>} /><div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">{[
        { label: "Responsável único", value: relationshipContext.owner?.full_name || "Sem responsável", detail: relationshipContext.owner?.commercial_role || relationshipContext.owner?.role || "Distribuição necessária", href: `/leads/${lead.id}/transfer` },
        { label: "Projeto de interesse", value: relationshipContext.development?.name || "Ainda não definido", detail: relationshipContext.development ? `${relationshipContext.development.developer_name || "Incorporadora"}${relationshipContext.development.city ? ` · ${relationshipContext.development.city}` : ""}` : "Complete para melhorar o matching", href: relationshipContext.development ? `/developments/${relationshipContext.development.id}` : "/developments" },
        { label: "Origem", value: relationshipContext.campaign?.name || relationshipContext.origin.source, detail: relationshipContext.campaign ? `${relationshipContext.campaign.channel || "Canal não informado"} · ${relationshipContext.origin.campaignEvents} sinais` : `${relationshipContext.origin.historicalMemories} memórias históricas`, href: relationshipContext.campaign ? "/integrations/meta" : "/leads" },
        { label: "Comunicações", value: `${relationshipContext.communications.messages} mensagens`, detail: `${relationshipContext.communications.inbound} recebidas · ${relationshipContext.communications.unread} não lidas`, href: `/leads/${lead.id}/messages` },
        { label: "Score atual", value: `${lead.score ?? 0}/100`, detail: `${lead.temperature || "sem temperatura"} · prontidão ${intelligence.readiness}%`, href: "#qualificacao" },
        { label: "Histórico", value: `${activities.length} eventos`, detail: contactBriefing?.lastInteractionAt ? `Último em ${new Date(contactBriefing.lastInteractionAt).toLocaleDateString("pt-BR")}` : "Primeiro contato pendente", href: "#historico" },
        { label: "Pipeline", value: `${opportunities.length} oportunidades`, detail: `${contactBriefing?.activeOpportunities ?? 0} negócios ativos`, href: "/pipeline" },
        { label: "Próxima ação", value: intelligence.nextAction, detail: `${unifiedProfile?.tasks.length ?? 0} tarefas vinculadas`, href: `/leads/${lead.id}/tasks` },
      ].map((item) => <Link href={item.href} key={item.label} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4 transition hover:border-cyan-400/20 hover:bg-cyan-400/[.035]"><span className="text-[10px] font-bold uppercase tracking-[.15em] text-slate-500">{item.label}</span><strong className="mt-2 block text-sm leading-5 text-white">{item.value}</strong><p className="mt-2 text-[11px] leading-5 text-slate-500">{item.detail}</p></Link>)}</div><div className="border-t border-white/[.06] px-5 py-4 text-[11px] leading-5 text-slate-500 sm:px-6">A tela não cria uma segunda versão do cliente: cada bloco aponta para o registro canônico e respeita o mesmo proprietário, organização, RLS e histórico auditável.</div></AtlasCard> : null}

      {dataQuality && unifiedProfile ? <AtlasCard><AtlasCardHeader eyebrow="Fonte única da verdade" title="Perfil unificado e qualidade dos dados" description="CRM, atendimento, vendas e marketing reunidos no mesmo cliente, com lacunas e inconsistências explicadas pela IA." action={<AtlasBadge tone={dataQuality.status === "complete" ? "success" : dataQuality.status === "review" ? "danger" : "warning"}>{dataQuality.completeness}% COMPLETO</AtlasBadge>} /><div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-[.8fr_1.2fr]"><div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5"><div className="flex items-end justify-between"><div><p className="atlas-eyebrow">Identidade canônica</p><strong className="mt-2 block text-lg text-white">Um cliente, um histórico</strong></div><span className="text-3xl font-semibold text-cyan-200">{dataQuality.completedFields}/{dataQuality.totalFields}</span></div><div className="mt-4"><AtlasProgress value={dataQuality.completeness} label="Completude para personalização" /></div><div className="mt-4 flex flex-wrap gap-2">{unifiedProfile.sources.map((source) => <AtlasBadge key={source} tone="info">{source.toUpperCase()}</AtlasBadge>)}</div><div className="mt-5 grid grid-cols-3 gap-2 text-center">{[["Conversas", unifiedProfile.conversations.length], ["Tarefas", unifiedProfile.tasks.length], ["Sinais de campanha", unifiedProfile.campaignEvents.length]].map(([label, value]) => <div key={label} className="rounded-xl bg-white/[.03] p-3"><strong className="text-lg text-white">{value}</strong><p className="mt-1 text-[10px] text-slate-500">{label}</p></div>)}</div></div><div className="space-y-3"><div className="rounded-2xl border border-violet-400/15 bg-violet-400/[.06] p-4"><p className="atlas-eyebrow">Próximo dado mais valioso</p><p className="mt-2 text-sm leading-6 text-violet-100">{dataQuality.recommendation}</p></div>{dataQuality.missing.length ? <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[.05] p-4"><p className="text-xs font-bold uppercase tracking-[.14em] text-amber-300">Lacunas encontradas</p><div className="mt-3 flex flex-wrap gap-2">{dataQuality.missing.map((item) => <span key={item.key} className="rounded-full border border-amber-300/15 px-3 py-1 text-xs text-amber-100">{item.label}</span>)}</div></div> : null}{dataQuality.inconsistencies.length ? <div className="rounded-2xl border border-rose-400/15 bg-rose-400/[.05] p-4"><p className="text-xs font-bold uppercase tracking-[.14em] text-rose-300">Revisão humana necessária</p><ul className="mt-2 space-y-1 text-xs text-slate-300">{dataQuality.inconsistencies.map((item) => <li key={item}>• {item}</li>)}</ul></div> : null}<p className="text-[11px] leading-5 text-slate-500">O Atlas nunca funde cadastros ambíguos silenciosamente. Sugestões de limpeza ou consolidação preservam proprietário, consentimento, timeline e auditoria.</p></div></div></AtlasCard> : null}

      {contactBriefing ? <AtlasCard><AtlasCardHeader eyebrow="Briefing antes do contato" title="Chegue preparado à conversa ou visita" description="Resumo automático do relacionamento, pendências e próximos passos com base na fonte única do CRM." action={<div className="flex gap-2"><AtlasBadge tone="violet">IA LOCAL</AtlasBadge><AtlasBadge tone="success">CUSTO REDUZIDO</AtlasBadge></div>} /><div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[.9fr_1.1fr]"><div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5"><p className="atlas-eyebrow">Último contexto conhecido</p><p className="mt-3 text-sm leading-6 text-slate-300">{contactBriefing.context}</p><div className="mt-5 grid grid-cols-3 gap-2 text-center">{[["Não lidas", contactBriefing.unreadMessages], ["Tarefas abertas", contactBriefing.openTasks], ["Negócios ativos", contactBriefing.activeOpportunities]].map(([label, value]) => <div key={label} className="rounded-xl bg-white/[.03] p-3"><strong className="text-lg text-white">{value}</strong><p className="mt-1 text-[10px] text-slate-500">{label}</p></div>)}</div></div><div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[.05] p-5"><p className="atlas-eyebrow">Roteiro recomendado</p><ol className="mt-4 space-y-3">{contactBriefing.actions.map((action, index) => <li key={action} className="flex gap-3 text-sm leading-6 text-cyan-50"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cyan-300/10 text-xs font-bold text-cyan-200">{index + 1}</span>{action}</li>)}</ol><p className="mt-5 text-[11px] leading-5 text-slate-500">Preparado por {contactBriefing.generatedBy}. O corretor revisa e decide antes de qualquer envio ou alteração.</p></div></div></AtlasCard> : null}

      {experienceSignals[0]?.status === "pending" ? <AtlasCard><AtlasCardHeader eyebrow="IA de experiência" title="Atenção ao atendimento" description="A recomendação é explicável e a troca nunca acontece automaticamente." action={<AtlasBadge tone={experienceSignals[0].severity === "critical" ? "danger" : "warning"}>{experienceSignals[0].confidence}% confiança</AtlasBadge>} /><div className="grid gap-4 p-5 sm:p-6 xl:grid-cols-[1fr_.8fr]"><div className="rounded-2xl border border-amber-400/15 bg-amber-400/[.05] p-4"><p className="font-semibold text-white">{experienceSignals[0].evidence}</p><p className="mt-2 text-sm text-slate-400">Recomendação: {experienceSignals[0].recommendation === "offer_broker_change" ? "oferecer ao cliente a opção de manter ou trocar o corretor" : "recuperar o atendimento com acompanhamento"}.</p></div><div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[.05] p-4"><p className="atlas-eyebrow">Resposta sugerida</p><p className="mt-2 text-sm leading-6 text-cyan-50">{experienceSignals[0].suggested_reply}</p></div></div></AtlasCard> : null}

      {lead.source === "Meta Lead Ads" ? <AtlasCard><AtlasCardHeader eyebrow="Meta campaign context" title="Origem e aprendizado do lead" description="Informações de campanha preservadas automaticamente para atribuição, qualidade e otimização posterior." /><div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-5">{[["Origem", lead.metadata?.meta?.sourceName || "Meta Lead Ads"], ["Campanha", lead.metadata?.meta?.campaignId || "Não identificada"], ["Conjunto", lead.metadata?.meta?.adsetId || "Não identificado"], ["Anúncio", lead.metadata?.meta?.adId || "Não identificado"], ["Aprendizado", lead.metadata?.meta?.dataSharingConsent ? "Autorizado" : "Sem autorização"]].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/[.06] bg-white/[.025] p-4"><span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span><strong className="mt-2 block break-all text-sm text-white">{value}</strong></div>)}</div><div className="border-t border-white/[.06] px-5 py-4 text-xs leading-5 text-slate-400 sm:px-6">O corretor só precisa manter o estágio e o acompanhamento atualizados. O CRM transforma essas ações em sinais estruturados; textos livres e dados pessoais não são exibidos nos relatórios de campanha.</div></AtlasCard> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <AtlasMetric label="Score Atlas" value={lead.score ?? 0} detail="Qualificação atual" trend="AI" tone="blue" />
        <AtlasMetric label="Oportunidades" value={opportunities.length} detail="Negócios vinculados" trend="PIPE" tone="violet" />
        <AtlasMetric label="Interações" value={activities.length} detail="Eventos registrados" trend="360" tone="green" />
        <AtlasMetric label="Matches" value={matches.length} detail="Imóveis recomendados" trend="MATCH" tone="amber" />
        <AtlasMetric label="Risco" value={intelligence.risk} detail="Risco de inércia" trend="SLA" tone={intelligence.risk === "alto" ? "rose" : "green"} />
      </section>

      {qualification ? (
        <div id="qualificacao"><AtlasCard>
          <AtlasCardHeader eyebrow="Fase 44 · Qualificação rápida" title="Como o Atlas chegou a esta qualificação" description={`Confiança de ${qualification.confidence}% · ${qualification.progress.answered}/3 respostas essenciais · recalculado em ${new Date(qualification.recalculatedAt).toLocaleString("pt-BR")}.`} action={<div className="flex gap-2"><AtlasBadge tone={qualification.scoreChange.delta >= 0 ? "success" : "warning"}>{qualification.scoreChange.delta >= 0 ? "+" : ""}{qualification.scoreChange.delta} PONTOS</AtlasBadge><AtlasBadge tone={temperatureTone(qualification.temperature)}>{qualification.score}/100 · {qualification.temperature}</AtlasBadge></div>} />
          <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[1.2fr_.8fr]">
            <div className="grid gap-3 sm:grid-cols-2">
              {qualification.dimensions.map((dimension) => <div key={dimension.key} className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4"><div className="flex items-center justify-between"><strong className="text-sm text-white">{dimension.label}</strong><span className="text-xs font-semibold text-sky-300">{dimension.score}/{dimension.maximum}</span></div><div className="mt-3"><AtlasProgress value={Math.round(dimension.score / dimension.maximum * 100)} /></div><p className="mt-3 text-xs leading-5 text-slate-500">{dimension.reasons.slice(0, 2).join(" · ") || "Ainda sem sinais suficientes"}</p></div>)}
            </div>
            <div className="space-y-3">
              <div className="rounded-2xl border border-violet-400/15 bg-violet-400/[0.06] p-4"><p className="atlas-eyebrow">Próxima melhor ação</p><p className="mt-2 text-sm leading-6 text-violet-100">{qualification.nextBestAction}</p></div>
              {qualification.risks.length ? <div className="rounded-2xl border border-rose-400/15 bg-rose-400/[0.06] p-4"><p className="text-xs font-bold uppercase tracking-[.14em] text-rose-300">Riscos</p><ul className="mt-2 space-y-1 text-xs text-slate-300">{qualification.risks.map((risk) => <li key={risk}>• {risk}</li>)}</ul></div> : null}
              {qualification.missingData.length ? <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] p-4"><p className="text-xs font-bold uppercase tracking-[.14em] text-amber-300">Dados que aumentam a confiança</p><p className="mt-2 text-xs leading-5 text-slate-300">{qualification.missingData.join(" · ")}</p></div> : null}
            </div>
          </div>
          {qualification.recommendedQuestions.length ? <div className="border-t border-white/[.06] p-5 sm:p-6"><div className="flex items-center justify-between"><p className="atlas-eyebrow">Próxima pergunta mais relevante</p><span className="text-xs text-cyan-200">{qualification.progress.percent}% essencial concluído</span></div><div className="mt-4 grid gap-3 lg:grid-cols-3">{qualification.recommendedQuestions.map((question,index) => <div key={question.key} className={`rounded-2xl border p-4 ${index===0?"border-cyan-300/30 bg-cyan-400/[.07]":"border-white/[.07] bg-white/[.025]"}`}><strong className="text-sm text-white">{question.question}</strong><p className="mt-1 text-xs leading-5 text-slate-500">{question.why}</p>{question.options ? <div className="mt-3 flex flex-wrap gap-2">{question.options.map((option) => <button key={option.value} disabled={qualifying} onClick={() => void qualifyLead({ [question.key]: option.value })} className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-cyan-100 hover:border-cyan-400/40">{option.label}</button>)}</div> : <button onClick={() => document.querySelector<HTMLInputElement>(question.key === "budget" ? 'input[placeholder="Orçamento máximo"]' : 'input[placeholder="Regiões preferidas"]')?.focus()} className="atlas-button-secondary mt-3">Preencher perfil</button>}</div>)}</div><p className="mt-4 text-[11px] leading-5 text-slate-500">Finalidade, prazo e pagamento recalibram score e próxima ação imediatamente. Para a Meta saem apenas categorias agregadas; conversa livre e dados pessoais permanecem no CRM.</p></div> : null}
        </AtlasCard></div>
      ) : null}

      {proposals.length ? <AtlasCard><AtlasCardHeader eyebrow="Fase 37 · SLA de proposta" title="Preparação, envio e retorno" description="Preço, estoque e regra continuam governados; agora o contato com o cliente também fica mensurado." /><div className="grid gap-3 p-5 sm:p-6 lg:grid-cols-2">{proposals.map((proposal) => <article key={proposal.id} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><div className="flex items-start justify-between gap-3"><div><strong className="text-white">{proposal.rule_snapshot?.propertyTitle || "Proposta comercial"}</strong><p className="mt-1 text-xs text-slate-500">{brl.format(proposal.property_price)} · válida até {new Date(proposal.valid_until).toLocaleString("pt-BR")}</p></div><AtlasBadge tone={proposal.status === "accepted" ? "success" : proposal.status === "declined" || proposal.status === "expired" ? "danger" : proposal.status === "sent" ? "info" : "warning"}>{proposal.status.toUpperCase()}</AtlasBadge></div><div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-xl bg-white/[.03] p-2"><span className="text-slate-500">Preparação</span><strong className="mt-1 block text-white">{proposal.preparation_minutes ?? "—"} min</strong></div><div className="rounded-xl bg-white/[.03] p-2"><span className="text-slate-500">Revisão</span><strong className="mt-1 block text-white">{proposal.review_minutes ?? "—"} min</strong></div><div className="rounded-xl bg-white/[.03] p-2"><span className="text-slate-500">Resposta</span><strong className="mt-1 block text-white">{proposal.response_minutes ?? "—"} min</strong></div></div>{proposal.status === "approved" ? <button onClick={() => void updateProposal(proposal.id,"sent")} className="atlas-button-primary mt-4">Registrar envio ao cliente</button> : null}{proposal.status === "sent" ? <div className="mt-4 flex gap-2"><button onClick={() => void updateProposal(proposal.id,"accepted")} className="atlas-button-primary">Cliente aceitou</button><button onClick={() => void updateProposal(proposal.id,"declined","Cliente recusou a condição apresentada.")} className="atlas-button-secondary">Cliente recusou</button></div> : null}</article>)}</div></AtlasCard> : null}

      {simulation ? <AtlasCard><AtlasCardHeader eyebrow="Fase 46 · Simulação, não promessa" title={`${simulation.rule_snapshot.ruleName} · versão ${simulation.rule_snapshot.version}`} description={`Regra vigente de ${simulation.rule_snapshot.developerName} fotografada no cálculo; mudanças futuras não alteram este histórico.`} action={<AtlasBadge tone="warning">VÁLIDA ATÉ {new Date(simulation.valid_until).toLocaleString("pt-BR")}</AtlasBadge>} /><div className="mx-5 mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/[.07] p-4 text-xs font-semibold leading-5 text-amber-100 sm:mx-6">{simulation.rule_snapshot.disclaimer}</div><div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">{[["Preço de referência", brl.format(simulation.property_price)], ["Entrada estimada", simulation.down_payment === null ? "Conforme fluxo" : brl.format(simulation.down_payment)], ["Saldo após entrada", simulation.financed_balance === null ? "A definir" : brl.format(simulation.financed_balance)], ["Parcelas lineares estimadas", simulation.installment_amount === null ? "Conforme regra" : `${simulation.installments_count} × ${brl.format(simulation.installment_amount)}`]].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><span className="text-xs text-slate-500">{label}</span><strong className="mt-2 block text-lg text-white">{value}</strong></div>)}</div><div className="border-t border-white/[.06] p-5 sm:p-6"><p className="whitespace-pre-line text-xs leading-5 text-slate-300">{simulation.rule_snapshot.paymentFlow}</p>{simulation.rule_snapshot.balloonPaymentNotes ? <p className="mt-3 text-xs text-slate-400"><strong>Reforços:</strong> {simulation.rule_snapshot.balloonPaymentNotes}</p> : null}{simulation.rule_snapshot.financingNotes ? <p className="mt-2 text-xs text-slate-400"><strong>Crédito:</strong> {simulation.rule_snapshot.financingNotes}</p> : null}<p className="mt-4 rounded-xl bg-white/[.025] p-3 text-[10px] leading-5 text-slate-500">Base do cálculo: {simulation.rule_snapshot.calculation}</p><button onClick={() => void requestProposal()} className="atlas-button-primary mt-4">Enviar para revisão humana</button></div></AtlasCard> : null}

      <section className="grid gap-6 2xl:grid-cols-[1.15fr_.85fr]">
        <AtlasCard>
          <AtlasCardHeader eyebrow="Customer profile" title="Dados e qualificação" description="Perfil comercial, preferências e capacidade financeira do comprador." />
          <form onSubmit={saveLead} className="p-5 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <input className={inputClass} value={lead.name ?? ""} placeholder="Nome" onChange={(e) => setLead({ ...lead, name: e.target.value })} />
              <input className={inputClass} value={lead.phone ?? ""} placeholder="Telefone" onChange={(e) => setLead({ ...lead, phone: e.target.value })} />
              <input className={inputClass} value={lead.email ?? ""} placeholder="E-mail" onChange={(e) => setLead({ ...lead, email: e.target.value })} />
              <input className={inputClass} value={lead.source ?? ""} placeholder="Origem" onChange={(e) => setLead({ ...lead, source: e.target.value })} />
              <select className={inputClass} value={lead.status ?? "novo"} onChange={(e) => setLead({ ...lead, status: e.target.value })}>{["novo","contato","qualificacao","visita","proposta","contrato","ganho","perdido","comprou_outro"].map((status) => <option key={status} value={status}>{status === "comprou_outro" ? "Comprou em outro lugar" : status}</option>)}</select>
              <select className={inputClass} value={lead.temperature ?? "frio"} onChange={(e) => setLead({ ...lead, temperature: e.target.value })}><option>frio</option><option>morno</option><option>quente</option></select>
              <input className={inputClass} type="number" value={lead.budget_min ?? ""} placeholder="Orçamento mínimo" onChange={(e) => setLead({ ...lead, budget_min: e.target.value ? Number(e.target.value) : null })} />
              <input className={inputClass} type="number" value={lead.budget_max ?? ""} placeholder="Orçamento máximo" onChange={(e) => setLead({ ...lead, budget_max: e.target.value ? Number(e.target.value) : null })} />
              <input className={inputClass} type="number" value={lead.bedrooms ?? ""} placeholder="Dormitórios" onChange={(e) => setLead({ ...lead, bedrooms: e.target.value ? Number(e.target.value) : null })} />
              <input className={inputClass} value={(lead.preferred_regions ?? []).join(", ")} placeholder="Regiões preferidas" onChange={(e) => setLead({ ...lead, preferred_regions: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} />
            </div>
            <textarea className={`${inputClass} mt-4 min-h-32`} value={lead.notes ?? ""} placeholder="Observações estratégicas" onChange={(e) => setLead({ ...lead, notes: e.target.value })} />
            <div className="mt-5 flex justify-end"><button disabled={saving} className="atlas-button-primary disabled:opacity-50">{saving ? "Salvando..." : "Salvar alterações"}</button></div>
          </form>
        </AtlasCard>

        <div className="space-y-6">
          <div id="historico"><AtlasCard>
            <AtlasCardHeader eyebrow="Atlas AI" title="Próxima ação recomendada" description="Orientação calculada a partir do perfil, histórico e pipeline." />
            <div className="p-5 sm:p-6"><div className="rounded-2xl border border-violet-400/15 bg-violet-400/[0.06] p-5"><p className="text-sm font-medium text-violet-100">{intelligence.nextAction}</p><p className="mt-2 text-xs leading-5 text-slate-400">Risco atual: {intelligence.risk}. Atualize o histórico após cada contato para melhorar as recomendações.</p></div><form onSubmit={addActivity} className="mt-4 space-y-3"><div className="grid gap-3 sm:grid-cols-[1fr_150px]"><input className={inputClass} value={activityTitle} onChange={(e) => setActivityTitle(e.target.value)} placeholder="Registrar ligação, mensagem ou visita" /><select className={inputClass} value={activityType} onChange={(e) => setActivityType(e.target.value)}><option value="note">Nota</option><option value="call">Ligação</option><option value="whatsapp">WhatsApp</option><option value="visit">Visita</option><option value="email">E-mail</option></select></div><textarea className={`${inputClass} min-h-24 resize-y`} value={activityDescription} onChange={(e) => setActivityDescription(e.target.value)} placeholder="O que o cliente falou? Ex.: achou o preço alto, prefere outro bairro, precisa financiar ou quer entrega imediata." /><div className="flex flex-wrap gap-2">{["Preço", "Localização", "Financiamento", "Prazo", "Produto", "Concorrência"].map((signal) => <button key={signal} type="button" onClick={() => setActivityDescription((current) => `${current}${current ? " · " : ""}${signal}: `)} className="rounded-full border border-white/10 bg-white/[.03] px-3 py-1.5 text-[11px] text-slate-300 hover:border-violet-400/30">+ {signal}</button>)}</div><p className="text-[11px] leading-5 text-slate-500">A descrição fica protegida no CRM. A inteligência usa somente categorias anônimas para indicar melhorias de público e criativo.</p><button className="atlas-button-secondary w-full">Salvar acompanhamento e aprendizado</button></form></div>
          </AtlasCard></div>

          <AtlasCard>
            <AtlasCardHeader eyebrow="Timeline" title="Histórico do relacionamento" description="Interações, mudanças e eventos recentes." />
            <div className="max-h-[420px] overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">{activities.length === 0 ? <AtlasEmpty title="Nenhuma interação" description="Registre o primeiro contato para iniciar a memória comercial." /> : <div className="space-y-3">{activities.map((activity) => <article key={activity.id} className="relative rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4 pl-12"><span className="absolute left-4 top-4 grid h-7 w-7 place-items-center rounded-full border border-sky-400/20 bg-sky-400/10 text-xs text-sky-300">•</span><div className="flex items-start justify-between gap-3"><div><p className="font-medium text-white">{activity.title}</p>{activity.description ? <p className="mt-1 text-xs leading-5 text-slate-400">{activity.description}</p> : null}</div><AtlasBadge tone="info">{activity.type}</AtlasBadge></div><p className="mt-3 text-[10px] uppercase tracking-wider text-slate-600">{activity.authorName || "Equipe Atlas"} · {new Date(activity.occurred_at).toLocaleString("pt-BR")}</p></article>)}</div>}</div>
          </AtlasCard>
        </div>
      </section>

      <AtlasCard>
        <AtlasCardHeader eyebrow="Matching Atlas" title="Imóveis recomendados" description="Ranking de aderência entre perfil, orçamento, tipologia e localização." action={<Link href="/properties" className="text-xs font-semibold text-sky-300">Ver estoque →</Link>} />
        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3 sm:p-6">{matches.length === 0 ? <div className="md:col-span-2 xl:col-span-3"><AtlasEmpty title="Nenhum match encontrado" description="Complete orçamento, dormitórios e regiões para melhorar o matching." /></div> : matches.map(({ property, match }) => <article key={property.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 transition hover:-translate-y-1 hover:border-sky-400/20"><div className="flex items-start justify-between gap-3"><div><p className="atlas-eyebrow">Aderência comercial</p><h3 className="mt-2 font-semibold text-white">{property.title || "Imóvel sem título"}</h3></div><AtlasBadge tone={match.score >= 75 ? "success" : match.score >= 50 ? "warning" : "info"}>{match.score}%</AtlasBadge></div><p className="mt-2 text-sm text-slate-400">{property.city || "Localização não informada"}{property.state ? ` · ${property.state}` : ""}</p><p className="mt-4 text-xl font-semibold text-white">{property.price ? brl.format(property.price) : "Preço sob consulta"}</p><ul className="mt-4 space-y-1.5 text-xs text-slate-400">{match.reasons.slice(0, 3).map((reason) => <li key={reason}>• {reason}</li>)}</ul><div className="mt-5 grid grid-cols-2 gap-2"><button onClick={() => void createOpportunity(property.id)} className="atlas-button-secondary">Oportunidade</button><button onClick={() => void simulate(property.id)} className="atlas-button-primary">Simular fluxo</button></div></article>)}</div>
      </AtlasCard>
    </div>
  );
}
