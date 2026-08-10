"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AtlasBadge, AtlasEmpty, AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";
import { supabase } from "@/lib/supabase";

type Lead = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  project: string | null;
  source: string | null;
  status: string | null;
  score: number;
  temperature: string | null;
  next_action_label: string | null;
  next_action_at: string | null;
};

type TransferTarget = {
  id: string;
  name: string;
  role: "manager" | "broker";
  team: string | null;
};

type ApiPayload<T> = {
  ok?: boolean;
  data?: T;
  error?: { message?: string } | string;
};

const uuidPattern = /^[0-9a-f-]{36}$/i;

function apiMessage(payload: ApiPayload<unknown>, fallback: string) {
  if (typeof payload.error === "string") return payload.error;
  return payload.error?.message || fallback;
}

function phoneLinks(phone: string | null) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  const international = digits.startsWith("55") ? digits : `55${digits}`;
  return {
    call: `tel:+${international}`,
    whatsapp: `https://wa.me/${international}`,
  };
}

function roleLabel(role: TransferTarget["role"]) {
  return role === "manager" ? "Gerente" : "Corretor";
}

function LeadActionsWorkspace() {
  const searchParams = useSearchParams();
  const requestedIds = useMemo(
    () => [...new Set((searchParams.get("leadIds") || "").split(",").map((value) => value.trim()).filter((value) => uuidPattern.test(value)))].slice(0, 100),
    [searchParams],
  );
  const source = searchParams.get("source") || "carteira";
  const intent = searchParams.get("intent") || "next_action";
  const [leads, setLeads] = useState<Lead[]>([]);
  const [targets, setTargets] = useState<TransferTarget[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(requestedIds));
  const [targetOwnerId, setTargetOwnerId] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [canTransfer, setCanTransfer] = useState(false);
  const [transferReviewOpen, setTransferReviewOpen] = useState(false);

  const accessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || "";
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const token = await accessToken();
      if (!token) {
        setError("Sua sessão expirou. Entre novamente para continuar.");
        return;
      }
      const query = new URLSearchParams({ limit: requestedIds.length ? "100" : "25" });
      if (requestedIds.length) query.set("ids", requestedIds.join(","));
      else query.set("attention", "no_action");

      const [leadsResponse, targetsResponse] = await Promise.all([
        fetch(`/api/v1/crm/leads?${query.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        fetch("/api/v1/crm/leads/bulk-transfer", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
      ]);
      const leadsPayload = await leadsResponse.json() as ApiPayload<{ items: Lead[] }>;
      if (!leadsResponse.ok) {
        setError(apiMessage(leadsPayload, "Não foi possível carregar as leads selecionadas."));
        return;
      }
      const loadedLeads = leadsPayload.data?.items ?? [];
      setLeads(loadedLeads);
      setSelected((current) => {
        const available = new Set(loadedLeads.map((lead) => lead.id));
        const preserved = [...current].filter((id) => available.has(id));
        return new Set(preserved.length ? preserved : requestedIds.filter((id) => available.has(id)));
      });

      const targetsPayload = await targetsResponse.json() as ApiPayload<{ targets: TransferTarget[] }>;
      if (targetsResponse.ok) {
        setTargets(targetsPayload.data?.targets ?? []);
        setCanTransfer(true);
      } else {
        setTargets([]);
        setCanTransfer(false);
      }
    } catch {
      setError("A central de ações não respondeu. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, requestedIds]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleLead(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setNotice("");
  }

  async function transfer() {
    if (!canTransfer || !selected.size || !targetOwnerId || reason.trim().length < 10) return;
    const target = targets.find((item) => item.id === targetOwnerId);
    if (!target) return;
    setTransferReviewOpen(false);
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const token = await accessToken();
      const response = await fetch("/api/v1/crm/leads/bulk-transfer", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leadIds: [...selected],
          targetOwnerId,
          reason: reason.trim(),
          humanConfirmed: true,
        }),
      });
      const payload = await response.json() as ApiPayload<{ transferred?: number }>;
      if (!response.ok) {
        setError(apiMessage(payload, "A transferência não foi concluída."));
        return;
      }
      const transferred = selected.size;
      setReason("");
      setTargetOwnerId("");
      await load();
      setNotice(`${transferred} lead(s) transferida(s) com responsável único, histórico e auditoria preservados.`);
    } catch {
      setError("A transferência não respondeu. Nenhuma alteração foi confirmada.");
    } finally {
      setWorking(false);
    }
  }

  function reviewTransfer() {
    if (!canTransfer || !selected.size || !targetOwnerId || reason.trim().length < 10) return;
    setTransferReviewOpen(true);
  }

  const selectedLeads = leads.filter((lead) => selected.has(lead.id));
  const withContact = selectedLeads.filter((lead) => phoneLinks(lead.phone) || lead.email).length;
  const hot = selectedLeads.filter((lead) => lead.temperature === "quente" || Number(lead.score || 0) >= 70).length;

  return (
    <div className="space-y-6 pb-10" data-lead-actions="governed-batch-workspace">
      <section className="atlas-grid-glow rounded-[30px] border border-cyan-400/10 bg-gradient-to-br from-cyan-500/[.12] via-blue-500/[.07] to-violet-500/[.1] p-6 sm:p-8">
        <div className="flex flex-wrap gap-2">
          <AtlasBadge tone="info">AÇÃO HUMANA</AtlasBadge>
          <AtlasBadge tone="success">HISTÓRICO PRESERVADO</AtlasBadge>
          <AtlasBadge tone="violet">IA SUPERVISIONADA</AtlasBadge>
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">Execute o próximo passo sem perder contexto.</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">Revise a seleção do pipeline, abra o contato certo e transfira a carteira somente dentro da hierarquia permitida. Nenhuma mensagem é disparada automaticamente.</p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-500">
          <span>Origem: {source}</span><span>·</span><span>Intenção: {intent}</span>
        </div>
      </section>

      {error ? <AtlasRecoverableError description={error} onRetry={() => void load()} busy={loading || working} /> : null}
      {notice ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[.07] p-4 text-sm text-emerald-100" role="status">{notice}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AtlasMetric label="Leads carregadas" value={loading ? "—" : leads.length} detail={requestedIds.length ? "Seleção recebida do pipeline" : "Sem próxima ação"} trend="BASE" tone="blue" />
        <AtlasMetric label="Selecionadas" value={loading ? "—" : selected.size} detail="Máximo de 100 nesta tela" trend="AÇÃO" tone="violet" />
        <AtlasMetric label="Com contato" value={loading ? "—" : withContact} detail="Telefone ou e-mail disponível" trend="CANAL" tone="green" />
        <AtlasMetric label="Prioridade alta" value={loading ? "—" : hot} detail="Score ≥ 70 ou temperatura quente" trend="FOCO" tone="amber" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Carteira de execução"
            title="Leads prontas para decisão"
            description="Escolha somente quem participa da próxima ação. Contato, contexto e IA continuam individuais."
            action={leads.length ? <button type="button" onClick={() => setSelected((current) => current.size === leads.length ? new Set() : new Set(leads.map((lead) => lead.id)))} className="atlas-button-secondary">{selected.size === leads.length ? "Limpar seleção" : "Selecionar todas"}</button> : null}
          />
          <div className="space-y-3 p-5 pt-0 sm:p-6 sm:pt-0">
            {loading ? [1, 2, 3].map((item) => <AtlasSkeleton key={item} className="h-36 w-full" />) : null}
            {!loading && !leads.length ? <AtlasEmpty reason="completed" title="Nenhuma lead aguardando ação" description="Volte ao pipeline para selecionar uma carteira ou revise os filtros de prioridade." action={<Link href="/pipeline" className="atlas-button-secondary">Abrir pipeline</Link>} /> : null}
            {leads.map((lead) => {
              const contact = phoneLinks(lead.phone);
              const checked = selected.has(lead.id);
              const copilotParams = new URLSearchParams({
                from: "lead-actions",
                intent: "follow_up",
                lead: lead.name || "Lead",
                stage: lead.status || "novo",
                score: String(lead.score || 0),
              });
              return (
                <article key={lead.id} className={`rounded-2xl border p-4 transition ${checked ? "border-cyan-300/25 bg-cyan-400/[.055]" : "border-white/[.07] bg-white/[.025]"}`}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={checked} onChange={() => toggleLead(lead.id)} aria-label={`Selecionar ${lead.name || "lead"}`} className="mt-1 h-4 w-4 accent-cyan-400" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-white">{lead.name || "Lead sem nome"}</h2>
                        <AtlasBadge tone={lead.temperature === "quente" || lead.score >= 70 ? "success" : "neutral"}>SCORE {lead.score || 0}</AtlasBadge>
                        <AtlasBadge tone="info">{lead.status || "novo"}</AtlasBadge>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">{lead.project || lead.source || "Projeto ainda não definido"}</p>
                      <p className="mt-3 text-sm text-slate-300">{lead.next_action_label || "Definir a próxima ação comercial"}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link href={`/leads/${lead.id}`} className="atlas-button-secondary">Lead 360</Link>
                        <Link href={`/leads/${lead.id}/messages?${copilotParams.toString()}`} className="atlas-button-secondary">IA preparar mensagem</Link>
                        {contact ? <a href={contact.call} className="atlas-button-secondary">Ligar</a> : null}
                        {contact ? <a href={contact.whatsapp} target="_blank" rel="noreferrer" className="atlas-button-secondary">WhatsApp</a> : null}
                        {!contact && lead.email ? <a href={`mailto:${lead.email}`} className="atlas-button-secondary">E-mail</a> : null}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </AtlasCard>

        <div className="space-y-6">
          <AtlasCard>
            <AtlasCardHeader eyebrow="Transferência auditada" title="Mude o responsável sem duplicar a lead" description={canTransfer ? "Os destinos abaixo já respeitam organização, papel e hierarquia." : "Seu perfil não possui permissão de transferência em massa."} />
            <div className="space-y-4 p-5 pt-0 sm:p-6 sm:pt-0">
              <label className="block text-xs text-slate-400">Destino permitido
                <select value={targetOwnerId} onChange={(event) => setTargetOwnerId(event.target.value)} disabled={!canTransfer || working} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white disabled:opacity-50">
                  <option value="">Selecione</option>
                  {targets.map((target) => <option key={target.id} value={target.id}>{target.name} · {roleLabel(target.role)}{target.team ? ` · ${target.team}` : ""}</option>)}
                </select>
              </label>
              <label className="block text-xs text-slate-400">Motivo auditável
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} disabled={!canTransfer || working} minLength={10} maxLength={500} placeholder="Ex.: redistribuição aprovada por capacidade e continuidade do atendimento" className="mt-2 min-h-28 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white placeholder:text-slate-600 disabled:opacity-50" />
              </label>
              <button type="button" disabled={!canTransfer || working || !selected.size || !targetOwnerId || reason.trim().length < 10} onClick={reviewTransfer} className="atlas-button-primary w-full disabled:cursor-not-allowed disabled:opacity-40">{working ? "Transferindo com segurança…" : `Revisar transferência de ${selected.size || 0} lead(s)`}</button>
              <p className="text-[11px] leading-5 text-slate-500">A operação mantém uma única pessoa responsável por lead, preserva timeline e registra ator, destino, quantidade e motivo.</p>
            </div>
          </AtlasCard>
          <AtlasCard>
            <AtlasCardHeader eyebrow="Cadência segura" title="Próximos passos individuais" description="Para proteger consentimento e contexto, cada contato continua sob revisão humana." />
            <div className="grid gap-2 p-5 pt-0">
              <Link href={selectedLeads[0] ? `/leads/${selectedLeads[0].id}/messages?from=lead-actions&intent=follow_up` : "/leads"} className="atlas-button-secondary text-center">Preparar abordagem com IA</Link>
              <Link href="/tasks" className="atlas-button-secondary text-center">Criar tarefas de acompanhamento</Link>
              <Link href="/leads/data-quality" className="atlas-button-secondary text-center">Revisar qualidade dos dados</Link>
            </div>
          </AtlasCard>
        </div>
      </section>

      {transferReviewOpen ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTransferReviewOpen(false); }}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-transfer-review-title"
            className="w-full max-w-xl rounded-[28px] border border-cyan-300/20 bg-[#07101f] p-6 shadow-2xl shadow-cyan-950/40"
          >
            <AtlasBadge tone="warning">DECISÃO EM MASSA</AtlasBadge>
            <h2 id="bulk-transfer-review-title" className="mt-4 text-2xl font-semibold tracking-[-.03em] text-white">Confirme o novo responsável</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {selected.size} lead(s) serão transferidas para <strong className="text-white">{targets.find((item) => item.id === targetOwnerId)?.name}</strong>. O Atlas manterá histórico, origem e um único responsável ativo.
            </p>
            <div className="mt-5 rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
              <span className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">Motivo registrado</span>
              <p className="mt-2 text-sm leading-6 text-slate-200">{reason.trim()}</p>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" className="atlas-button-secondary" onClick={() => setTransferReviewOpen(false)}>Voltar e revisar</button>
              <button type="button" className="atlas-button-primary" disabled={working} onClick={() => void transfer()}>{working ? "Transferindo…" : "Confirmar transferência"}</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default function LeadActionsPage() {
  return (
    <Suspense fallback={<div className="space-y-4 p-6"><AtlasSkeleton className="h-64 w-full" /><AtlasSkeleton className="h-96 w-full" /></div>}>
      <LeadActionsWorkspace />
    </Suspense>
  );
}
