"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";
import { AtlasSkeleton } from "@/components/ui/AtlasUI";
import { supabase } from "@/lib/supabase";

type Target = { id: string; full_name: string | null };
type Project = { id: string; name: string; developer_name: string | null };
type Batch = { id: string; name: string; owner_id: string; development_id: string | null; source_type: string; status: string; quality_status: string; imported_count: number; eligible_count: number; queued_count: number; delivered_count: number; read_count: number; replied_count: number; failed_count: number; created_at: string; summary: Record<string, number> };
type Experience = { id: string; lead_id: string; broker_id: string; severity: string; confidence: number; evidence: string; recommendation: string; suggested_reply: string; created_at: string };
type Offer = { contactId: string; batchId: string; status: string; aiPriority: "high" | "medium" | "learning"; aiSuggestion: string; lead: { id: string; name: string; status: string; score: number | null; assigned_to: string } };
type Payload = { viewer: { id: string; role: string }; targets: Target[]; projects: Project[]; batches: Batch[]; experiences: Experience[]; offers: Offer[] };
type Row = { name: string; phone: string; email?: string };

const FIELD_CLASS = "w-full rounded-xl border border-[rgba(148,163,184,0.16)] bg-[#0b1224] px-3.5 py-2.5 text-sm text-[#e8eef8] outline-none transition-colors placeholder:text-[#6b7890] focus:border-[color:var(--atlas-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--atlas-accent)]";
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";

/* CC-6: fonte única de rótulo e tom por prioridade da fila. */
const PRIORITY: Record<Offer["aiPriority"], { label: string; tone: "success" | "info" | "neutral" }> = {
  high: { label: "Prioridade alta", tone: "success" },
  medium: { label: "Prioridade média", tone: "info" },
  learning: { label: "Em aprendizado", tone: "neutral" },
};

function parseBase(text: string): Row[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows: Row[] = [];
  lines.slice(0, 501).forEach((line, index) => {
    const cells = line.split(/[;,\t]/).map((cell) => cell.trim().replace(/^"|"$/g, ""));
    if (index === 0 && cells.some((cell) => /nome|telefone|phone|email/i.test(cell))) return;
    if (cells[1]) rows.push({ name: cells[0] || "Lead reativação", phone: cells[1], email: cells[2] || undefined });
  });
  return rows;
}

async function token() { return (await supabase.auth.getSession()).data.session?.access_token || ""; }

export default function ImportLeadsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [raw, setRaw] = useState("");
  const [form, setForm] = useState({ name: "", ownerId: "", developmentId: "", sourceType: "company_legacy", consentBasis: "", consentConfirmed: false });
  const [activation, setActivation] = useState({ batchId: "", templateName: "", templateLanguage: "pt_BR", dailyCap: 100, intervalSeconds: 30 });
  const [experienceReasons, setExperienceReasons] = useState<Record<string, string>>({});
  const [phoneEvidence, setPhoneEvidence] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const response = await fetch("/api/v1/crm/reactivation", { headers: { Authorization: `Bearer ${await token()}` } });
    const result = await response.json();
    if (!response.ok) setError(result.error?.message || "Falha ao carregar bases.");
    else { setData(result.data); setForm((current) => ({ ...current, ownerId: current.ownerId || result.data.viewer.id })); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const rows = useMemo(() => parseBase(raw), [raw]);
  const isBroker = data?.viewer.role === "broker";
  const targetMap = useMemo(() => new Map((data?.targets ?? []).map((item) => [item.id, item.full_name || "Corretor"])), [data]);
  const projectMap = useMemo(() => new Map((data?.projects ?? []).map((item) => [item.id, item.name])), [data]);

  async function importBase() {
    setWorking(true); setError(""); setNotice("");
    const response = await fetch("/api/v1/crm/reactivation", { method: "POST", headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "import", ...form, rows }) });
    const result = await response.json();
    if (!response.ok) setError(result.error?.message || "Não foi possível importar.");
    else { setNotice(`${result.data.imported} contatos processados: ${result.data.eligible} elegíveis e ${result.data.blocked} bloqueados.`); setRaw(""); setForm((current) => ({ ...current, name: "", consentBasis: "", consentConfirmed: false })); await load(); }
    setWorking(false);
  }

  async function activate() {
    setWorking(true); setError(""); setNotice("");
    const response = await fetch("/api/v1/crm/reactivation", { method: "POST", headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "activate", ...activation }) });
    const result = await response.json();
    if (!response.ok) setError(result.error?.message || "Não foi possível preparar a campanha.");
    else { setNotice(`${result.data.prepared} contatos preparados. A campanha está aguardando uma aprovação gerencial.`); setActivation({ batchId: "", templateName: "", templateLanguage: "pt_BR", dailyCap: 100, intervalSeconds: 30 }); await load(); }
    setWorking(false);
  }

  async function control(batchId: string, command: "pause" | "resume") {
    setWorking(true); setError("");
    const response = await fetch("/api/v1/crm/reactivation", { method: "POST", headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "control", batchId, command }) });
    const result = await response.json();
    if (!response.ok) setError(result.error?.message || "Não foi possível controlar a campanha.");
    else { setNotice(command === "pause" ? "Campanha pausada imediatamente." : "Campanha retomada sob monitoramento."); await load(); }
    setWorking(false);
  }

  async function decideExperience(signalId: string, experienceDecision: "keep" | "change_requested") {
    setWorking(true); setError("");
    const response = await fetch("/api/v1/crm/reactivation", { method: "POST", headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "experience_decision", signalId, experienceDecision, reason: experienceReasons[signalId] || "" }) });
    const result = await response.json();
    if (!response.ok) setError(result.error?.message || "Não foi possível registrar a decisão.");
    else { setNotice(experienceDecision === "keep" ? "Corretor mantido com recuperação acompanhada." : "Troca solicitada para decisão e escolha do novo corretor."); await load(); }
    setWorking(false);
  }

  async function markInvalidPhone(leadId: string) {
    setWorking(true); setError(""); setNotice("");
    const response = await fetch("/api/v1/crm/reactivation", { method: "POST", headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_invalid_phone", leadId, phoneQualityReason: "invalid_phone", evidence: phoneEvidence[leadId] || "" }) });
    const result = await response.json();
    if (!response.ok) setError(result.error?.message || "Não foi possível registrar o telefone inválido.");
    else { setNotice("Telefone removido da oferta ativa e bloqueado nas próximas importações. O histórico foi preservado."); setPhoneEvidence((current) => ({ ...current, [leadId]: "" })); await load(); }
    setWorking(false);
  }

  function readFile(file?: File) {
    if (!file) return;
    if (file.size > 2_000_000) { setError("O arquivo deve ter no máximo 2 MB."); return; }
    const reader = new FileReader(); reader.onload = () => setRaw(String(reader.result || "")); reader.readAsText(file);
  }

  const totals = (data?.batches ?? []).reduce((sum, batch) => ({ contacts: sum.contacts + batch.imported_count, eligible: sum.eligible + batch.eligible_count, replies: sum.replies + (batch.summary.replied || 0) }), { contacts: 0, eligible: 0, replies: 0 });
  const protectionTotals = (data?.batches ?? []).reduce((sum, batch) => ({ optOut: sum.optOut + (batch.summary["blocked:opt_out"] || 0) + (batch.summary["blocked:opt_out_before_activation"] || 0), duplicates: sum.duplicates + (batch.summary["blocked:duplicado_no_arquivo"] || 0) + (batch.summary["blocked:lead_ja_existente"] || 0), invalid: sum.invalid + (batch.summary["blocked:invalid_phone_history"] || 0) + (batch.summary["blocked:invalid_phone_before_activation"] || 0) }), { optOut: 0, duplicates: 0, invalid: 0 });

  /* Sem elegíveis não há denominador: a taxa exibe "—" em vez de um 0% falso. */
  const decisive = [
    { label: "contatos importados", value: String(totals.contacts), ink: "" },
    { label: "elegíveis", value: String(totals.eligible), ink: totals.eligible ? "cc6-ok" : "" },
    { label: "respostas", value: String(totals.replies), ink: "" },
    { label: "taxa de resposta", value: totals.eligible ? `${Math.round((totals.replies / totals.eligible) * 100)}%` : "—", ink: "" },
  ];

  return (
    <div className="space-y-4 pb-10">
      <PageHeader
        eyebrow="Reativação · Bases antigas"
        title="Transforme bases paradas em novas conversas"
        description="Importe contatos antigos, distribua para o time ou trabalhe sua própria base — sempre com deduplicação, opt-out respeitado e templates aprovados do WhatsApp."
        action={{ href: "#nova-base", label: "Adicionar uma base" }}
      />

      {/* SALTO V4.2 · ponte para o importador governado da base histórica
          (relatório de qualidade + dedupe contra a base viva antes da carga). */}
      <Link
        href="/leads/import/historico"
        className={`inline-flex w-fit items-center gap-2 text-sm text-[#aab6ca] underline underline-offset-2 hover:text-[#e8eef8] ${focusRing}`}
      >
        Importar base histórica com relatório de qualidade →
      </Link>

      {/* Fila elegível em números antes de qualquer formulário — única
          superfície com 3D da página. */}
      <section aria-label="Números decisivos da reativação">
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
      {notice ? (
        <div className="cc6-sev-band cc6-panel-quiet py-3 pl-4 pr-3 text-sm leading-6 text-[#34d399]" role="status" style={{ "--cc6-sev": "#34d399" } as CSSProperties}>{notice}</div>
      ) : null}

      {/* Consentimento e supressões explícitos, uma única vez. */}
      <section className="cc6-panel-quiet cc6-reveal p-4" style={{ animationDelay: "60ms" }} aria-label="Consentimento e supressões">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="cc6-eyebrow">Fase 36 · Consentimento e supressões</p>
            <p className="mt-1.5 max-w-3xl text-xs leading-5 text-[#aab6ca]">Verificação na importação e novamente antes da aprovação: opt-outs e telefones inválidos permanecem bloqueados nas próximas importações, e nenhuma lead existente é transferida silenciosamente.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="cc6-chip"><strong className={`cc6-num font-semibold ${protectionTotals.optOut ? "cc6-crit" : ""}`}>{protectionTotals.optOut}</strong> opt-outs</span>
            <span className="cc6-chip"><strong className={`cc6-num font-semibold ${protectionTotals.duplicates ? "cc6-warn" : ""}`}>{protectionTotals.duplicates}</strong> duplicados</span>
            <span className="cc6-chip"><strong className={`cc6-num font-semibold ${protectionTotals.invalid ? "cc6-crit" : ""}`}>{protectionTotals.invalid}</strong> inválidos</span>
          </div>
        </div>
      </section>

      {data?.experiences.length ? (
        <section className="cc6-panel cc6-reveal p-4 sm:p-5" style={{ animationDelay: "120ms" }} aria-labelledby="experiences-title">
          <header>
            <p className="cc6-eyebrow">Fase 41 · Decisão humana</p>
            <h2 id="experiences-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Atendimentos que pedem decisão</h2>
            <p className="mt-1 text-xs leading-5 text-[#6b7890]">A IA explica o atrito, mas nunca troca o corretor — a decisão e o motivo ficam auditados.</p>
          </header>
          <div className="mt-3 grid gap-2">
            {data.experiences.map((item) => {
              const reason = experienceReasons[item.id] || "";
              const critical = item.severity === "critical";
              return (
                <article key={item.id} className="cc6-sev-band cc6-panel-quiet py-3 pl-4 pr-3" style={{ "--cc6-sev": critical ? "#fb7185" : "#f5b544" } as CSSProperties}>
                  <div className="grid gap-4 lg:grid-cols-[1fr_.8fr]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge tone={critical ? "danger" : "warning"}>{item.severity}</StatusBadge>
                        <span className="cc6-chip"><strong className="cc6-num font-semibold">{item.confidence}%</strong> confiança</span>
                      </div>
                      <p className="mt-2.5 text-[13px] font-semibold leading-6 text-[#e8eef8]">{item.evidence}</p>
                      <p className="mt-1.5 text-xs leading-5 text-[#aab6ca]">Sugestão ao cliente: “{item.suggested_reply}”</p>
                      <p className="mt-1.5 text-xs text-[#6b7890]">Corretor atual: {targetMap.get(item.broker_id) || "Responsável atual"}</p>
                    </div>
                    <div>
                      <textarea value={reason} onChange={(event) => setExperienceReasons((current) => ({ ...current, [item.id]: event.target.value }))} className={`${FIELD_CLASS} min-h-20`} placeholder="Motivo da decisão (obrigatório)" maxLength={500} />
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <button disabled={working || reason.trim().length < 5} onClick={() => void decideExperience(item.id, "keep")} className={`cc6-ghost-btn min-h-11 disabled:pointer-events-none disabled:opacity-40 ${focusRing}`}>Manter e recuperar</button>
                        <button disabled={working || reason.trim().length < 5} onClick={() => void decideExperience(item.id, "change_requested")} className="atlas-button-primary disabled:opacity-40">Solicitar troca</button>
                      </div>
                      <p className="mt-2 text-[10px] leading-4 text-[#6b7890]">Solicitar troca não altera o responsável atual; o pedido segue para aprovação.</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="cc6-panel cc6-reveal p-4 sm:p-5" style={{ animationDelay: "180ms" }} aria-labelledby="offers-title">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="cc6-eyebrow">Oferta ativa · Corretor + IA</p>
            <h2 id="offers-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Fila segura das bases antigas</h2>
            <p className="mt-1 text-xs leading-5 text-[#6b7890]">A IA prioriza e sugere a próxima abordagem; o corretor decide e executa.</p>
          </div>
          {!loading && data?.offers?.length ? <span className="cc6-chip">{data.offers.length} elegíveis</span> : null}
        </header>
        <div className="cc6-hairline mt-3" aria-busy={loading}>
          {loading ? (
            <div className="grid gap-2 py-4">{[1, 2, 3].map((row) => <AtlasSkeleton key={row} className="h-16" />)}</div>
          ) : !data?.offers?.length ? (
            <p className="py-4 text-xs leading-5 text-[#6b7890]">Nenhuma oferta ativa elegível — importe uma base autorizada ou aguarde novas respostas.</p>
          ) : (
            data.offers.slice(0, 30).map((offer) => {
              const evidence = phoneEvidence[offer.lead.id] || "";
              const priority = PRIORITY[offer.aiPriority];
              return (
                <article key={offer.contactId} className="grid gap-3 border-t border-[rgba(148,163,184,0.12)] py-4 first:border-t-0 lg:grid-cols-[1fr_1fr_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={priority.tone}>{priority.label}</StatusBadge>
                      <span className="cc6-chip">score <strong className="cc6-num font-semibold">{offer.lead.score ?? "—"}</strong></span>
                    </div>
                    <a href={`/leads/${offer.lead.id}`} className={`mt-2 block rounded-md text-sm font-semibold text-[#e8eef8] transition-colors hover:text-[color:var(--atlas-accent-hover)] ${focusRing}`}>{offer.lead.name}</a>
                    <p className="mt-0.5 text-xs leading-5 text-[#6b7890]">{offer.aiSuggestion}</p>
                  </div>
                  <input className={FIELD_CLASS} value={evidence} onChange={(event) => setPhoneEvidence((current) => ({ ...current, [offer.lead.id]: event.target.value }))} placeholder="Ex.: número inexistente confirmado na ligação" maxLength={500} aria-label={`Evidência de telefone inválido para ${offer.lead.name}`} />
                  <button disabled={working || evidence.trim().length < 5} onClick={() => void markInvalidPhone(offer.lead.id)} className={`min-h-11 rounded-xl border border-[rgba(251,113,133,0.3)] px-4 text-xs font-semibold text-[#fb7185] transition-colors hover:border-[#fb7185] disabled:pointer-events-none disabled:opacity-40 ${focusRing}`}>Telefone inválido</button>
                </article>
              );
            })
          )}
        </div>
      </section>

      <section id="nova-base" className="grid items-start gap-4 xl:grid-cols-[1.15fr_.85fr]">
        {/* Formulários planos, sem rotação. */}
        <section className="cc6-panel cc6-reveal p-4 sm:p-5" style={{ animationDelay: "240ms" }} aria-labelledby="import-form-title">
          <header>
            <p className="cc6-eyebrow">1 · Importação</p>
            <h2 id="import-form-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">{isBroker ? "Minha base externa" : "Nova base para ativação"}</h2>
            <p className="mt-1 text-xs leading-5 text-[#6b7890]">Formato: nome; telefone; e-mail. Até 500 contatos por base.</p>
          </header>
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <input className={FIELD_CLASS} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome da base" aria-label="Nome da base" />
              {!isBroker ? <select className={FIELD_CLASS} aria-label="Corretor responsável" value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}><option value="">Corretor responsável</option>{data?.targets.map((item) => <option key={item.id} value={item.id}>{item.full_name || "Corretor"}</option>)}</select> : null}
              <select className={FIELD_CLASS} aria-label="Projeto" value={form.developmentId} onChange={(e) => setForm({ ...form, developmentId: e.target.value })}><option value="">Projeto ainda não definido</option>{data?.projects.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.developer_name || "Incorporadora"}</option>)}</select>
              {!isBroker ? <select className={FIELD_CLASS} aria-label="Origem da base" value={form.sourceType} onChange={(e) => setForm({ ...form, sourceType: e.target.value })}><option value="company_legacy">Base antiga da empresa</option><option value="broker_external">Base externa do corretor</option></select> : null}
            </div>
            <textarea className={`${FIELD_CLASS} min-h-40 font-mono`} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={"Maria Silva; 11999999999; maria@email.com\nJoão Souza; 11988888888"} aria-label="Contatos da base" />
            <label className="block cursor-pointer rounded-xl border border-dashed border-[rgba(148,163,184,0.3)] p-4 text-center text-sm text-[#aab6ca] transition-colors focus-within:border-[color:var(--atlas-accent)] hover:border-[color:var(--atlas-accent)] hover:text-[#e8eef8]">
              Selecionar CSV ou TXT
              <input className="sr-only" type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => readFile(e.target.files?.[0])} />
            </label>
            <div className="cc6-panel-quiet p-4">
              <p className="text-sm font-semibold text-[#e8eef8]"><span className="cc6-num">{rows.length}</span> contatos reconhecidos</p>
              <p className="mt-1 text-xs leading-5 text-[#6b7890]">A prévia é processada somente após sua confirmação.</p>
            </div>
            <textarea className={FIELD_CLASS} value={form.consentBasis} onChange={(e) => setForm({ ...form, consentBasis: e.target.value })} placeholder="Como e quando estes contatos autorizaram mensagens?" aria-label="Base do consentimento" />
            <label className="cc6-panel-quiet flex gap-3 p-4 text-[13px] leading-6 text-[#aab6ca]">
              <input type="checkbox" className="mt-1" checked={form.consentConfirmed} onChange={(e) => setForm({ ...form, consentConfirmed: e.target.checked })} />
              <span>Confirmo que esta base possui autorização válida para contato e que não contém contatos comprados sem consentimento.</span>
            </label>
            <button disabled={working || !rows.length || !form.name.trim() || !form.consentConfirmed} onClick={() => void importBase()} className="atlas-button-primary w-full disabled:opacity-40">{working ? "Processando..." : "Importar e proteger a base"}</button>
          </div>
        </section>

        <section className="cc6-panel cc6-reveal p-4 sm:p-5" style={{ animationDelay: "300ms" }} aria-labelledby="activation-form-title">
          <header>
            <p className="cc6-eyebrow">2 · WhatsApp API</p>
            <h2 id="activation-form-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Preparar campanha de reativação</h2>
            <p className="mt-1 text-xs leading-5 text-[#6b7890]">Use o nome técnico de um template já aprovado no Meta WhatsApp Manager.</p>
          </header>
          <div className="mt-4 space-y-3">
            <select className={FIELD_CLASS} aria-label="Base importada" value={activation.batchId} onChange={(e) => setActivation({ ...activation, batchId: e.target.value })}><option value="">Selecione uma base importada</option>{data?.batches.filter((item) => item.status === "imported" && item.eligible_count > 0).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.eligible_count} elegíveis</option>)}</select>
            <input className={`${FIELD_CLASS} font-mono`} value={activation.templateName} onChange={(e) => setActivation({ ...activation, templateName: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} placeholder="reativacao_imovel_01" aria-label="Nome do template" />
            <select className={FIELD_CLASS} aria-label="Idioma do template" value={activation.templateLanguage} onChange={(e) => setActivation({ ...activation, templateLanguage: e.target.value })}><option value="pt_BR">Português (Brasil)</option><option value="en_US">Inglês</option><option value="es">Espanhol</option></select>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-[#6b7890]">Limite diário<input type="number" min="10" max="1000" className={`${FIELD_CLASS} cc6-num mt-2`} value={activation.dailyCap} onChange={(e) => setActivation({ ...activation, dailyCap: Number(e.target.value) })} /></label>
              <label className="block text-xs text-[#6b7890]">Intervalo (segundos)<input type="number" min="10" max="3600" className={`${FIELD_CLASS} cc6-num mt-2`} value={activation.intervalSeconds} onChange={(e) => setActivation({ ...activation, intervalSeconds: Number(e.target.value) })} /></label>
            </div>
            <p className="cc6-panel-quiet p-4 text-xs leading-5 text-[#aab6ca]"><strong className="font-semibold text-[#e8eef8]">Fluxo protegido:</strong> aprovação única, envio gradual a partir das 9h, limite diário, opt-out em tempo real e pausa por qualidade.</p>
            <button disabled={working || !activation.batchId || !activation.templateName} onClick={() => void activate()} className="atlas-button-primary w-full disabled:opacity-40">Enviar para aprovação</button>
          </div>
        </section>
      </section>

      <section className="cc6-panel cc6-reveal p-4 sm:p-5" style={{ animationDelay: "360ms" }} aria-labelledby="batches-title">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="cc6-eyebrow">Histórico</p>
            <h2 id="batches-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Bases e campanhas</h2>
            <p className="mt-1 text-xs leading-5 text-[#6b7890]">Importação, bloqueios, envios e respostas por base.</p>
          </div>
          {!loading && data?.batches.length ? <span className="cc6-chip">{data.batches.length} bases</span> : null}
        </header>
        <div className="cc6-hairline mt-3" aria-busy={loading}>
          {loading ? (
            <div className="grid gap-2 py-4">{[1, 2, 3].map((row) => <AtlasSkeleton key={row} className="h-14" />)}</div>
          ) : !data?.batches.length ? (
            <p className="py-4 text-xs leading-5 text-[#6b7890]">Nenhuma base importada — adicione a primeira base para iniciar a reativação.</p>
          ) : (
            data.batches.map((batch) => (
              <article key={batch.id} className="grid gap-3 border-t border-[rgba(148,163,184,0.12)] py-4 first:border-t-0 md:grid-cols-[1.3fr_.8fr_1fr_auto] md:items-center">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#e8eef8]">{batch.name}</p>
                  <p className="mt-0.5 text-xs text-[#6b7890]">{targetMap.get(batch.owner_id) || "Corretor"} · {batch.development_id ? projectMap.get(batch.development_id) : "Sem projeto"}</p>
                </div>
                <div>
                  <p className="cc6-num text-[13px] text-[#aab6ca]">{batch.eligible_count} elegíveis</p>
                  <p className="cc6-num mt-0.5 text-xs text-[#6b7890]">{batch.imported_count - batch.eligible_count} bloqueados · {batch.summary["blocked:opt_out"] || 0} opt-outs · {(batch.summary["blocked:duplicado_no_arquivo"] || 0) + (batch.summary["blocked:lead_ja_existente"] || 0)} duplicados</p>
                </div>
                <div>
                  <p className="cc6-num text-[13px] text-[#aab6ca]">{batch.delivered_count || 0} entregues · {batch.read_count || 0} lidas · {batch.replied_count || 0} respostas</p>
                  <p className="cc6-num mt-0.5 text-xs text-[#6b7890]">saúde {batch.quality_status && batch.quality_status !== "unknown" ? batch.quality_status : "—"} · {batch.failed_count || 0} falhas</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge tone={batch.quality_status === "red" || batch.status === "rejected" ? "danger" : batch.quality_status === "yellow" || batch.status === "pending_approval" ? "warning" : batch.status === "completed" ? "success" : "info"}>{batch.status.replaceAll("_", " ")}</StatusBadge>
                  {["queued", "running"].includes(batch.status) && batch.quality_status !== "red" ? <button disabled={working} onClick={() => void control(batch.id, "pause")} className={`rounded-md text-xs font-semibold text-[#fb7185] transition-colors hover:text-[#e8eef8] disabled:opacity-40 ${focusRing}`}>Pausar</button> : null}
                  {batch.quality_status === "red" && data.viewer.role !== "broker" ? <button disabled={working} onClick={() => void control(batch.id, "resume")} className={`rounded-md text-xs font-semibold text-[#34d399] transition-colors hover:text-[#e8eef8] disabled:opacity-40 ${focusRing}`}>Retomar</button> : null}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
