"use client";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasSkeleton } from "@/components/ui/AtlasUI";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";

type Provider = { id: "google" | "microsoft"; label: string; environmentReady: boolean };
type Connection = { provider: string; enabled: boolean; privacy: string; include_tasks: boolean; include_visits: boolean; include_follow_ups: boolean; last_sync_at: string | null };
type Data = { providers: Provider[]; connections: Connection[] };

/*
 * CC-6 · Calendário externo — consolidação do redesign: a página empilhava
 * três badges por cartão (CONECTADO + SOMENTE SAÍDA + PRIVADO) e repetia as
 * garantias em quatro bullets e mais um rodapé. Agora cada provedor tem um
 * único estado semântico, as garantias viram chips neutros e o aviso honesto
 * sobre OAuth/Hostinger permanece. Fetch, conexão e desconexão preservados;
 * a agenda real fica em /calendar, apontada no header.
 */

export default function CalendarIntegration() {
  const [data, setData] = useState<Data | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(""), [message, setMessage] = useState(""), [saving, setSaving] = useState("");
  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token || "", []);
  const load = useCallback(async () => { setLoading(true); const response = await fetch("/api/v1/integrations/calendar", { headers: { Authorization: `Bearer ${await token()}` }, cache: "no-store" }); const body = await response.json(); if (response.ok) { setData(body.data || body); setError(""); } else setError(body.error?.message || "Integração indisponível."); setLoading(false); }, [token]);
  useEffect(() => { void load(); }, [load]);
  async function act(provider: string, action: "save" | "disconnect") { setSaving(provider); setMessage(""); const response = await fetch("/api/v1/integrations/calendar", { method: "PATCH", headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" }, body: JSON.stringify({ provider, action, privacy: "private", includeTasks: true, includeVisits: true, includeFollowUps: true }) }); const body = await response.json(); if (response.ok) { setMessage(body.data?.next || "Conexão removida com segurança."); await load(); } else setError(body.error?.message || "Não foi possível atualizar."); setSaving(""); }

  return (
    <div className="space-y-4 pb-10" data-phase="47-external-calendar">
      <PageHeader
        eyebrow="Fase 47 · Calendário externo"
        title="Leve a agenda Atlas com privacidade"
        description="Sincronização pessoal e opcional, somente Atlas → calendário externo — por padrão, nomes de leads e detalhes comerciais não saem do CRM."
        action={{ href: "/calendar", label: "Abrir agenda", priority: "secondary" }}
      />

      {error ? (
        <p role="status" className="cc6-sev-band cc6-panel-quiet cc6-reveal py-3 pl-5 pr-4 text-sm text-[#fb7185]" style={{ "--cc6-sev": "#fb7185" } as CSSProperties}>
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="cc6-panel-quiet cc6-reveal px-4 py-3 text-sm text-[#aab6ca]">
          {message}
        </p>
      ) : null}

      {loading ? (
        <AtlasSkeleton className="h-64" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data?.providers.map((provider, index) => {
            const connection = data.connections.find(item => item.provider === provider.id);
            return (
              <section
                key={provider.id}
                aria-label={`Integração ${provider.label}`}
                className="cc6-panel cc6-reveal p-5"
                style={{ animationDelay: `${60 + index * 60}ms` }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`cc6-eyebrow ${provider.environmentReady ? "" : "cc6-warn"}`}>
                      {provider.environmentReady ? "Ambiente pronto" : "Credenciais pendentes"}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">{provider.label}</h2>
                    <p className="mt-1 text-sm leading-6 text-[#aab6ca]">
                      {connection?.enabled ? "Sincronização pessoal ativa." : "Conecte somente após revisar a política de privacidade."}
                    </p>
                  </div>
                  <StatusBadge tone={connection?.enabled ? "success" : "neutral"}>
                    {connection?.enabled ? "Conectado" : "Desconectado"}
                  </StatusBadge>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="cc6-chip">Somente saída</span>
                  <span className="cc6-chip">Privado</span>
                  <span className="cc6-chip">Tarefas · visitas · follow-ups opcionais</span>
                </div>

                <ul className="cc6-hairline mt-4 space-y-1.5 pt-4 text-sm leading-6 text-[#aab6ca]">
                  <li>Credenciais OAuth somente no servidor.</li>
                  <li>Desconexão remove a referência de acesso.</li>
                  <li>Sem alteração externa dentro do CRM.</li>
                </ul>

                <div className="mt-4 flex flex-wrap gap-2">
                  {connection?.enabled ? (
                    <button disabled={saving === provider.id} onClick={() => void act(provider.id, "disconnect")} className="cc6-ghost-btn disabled:opacity-50">
                      Desconectar
                    </button>
                  ) : (
                    <button disabled={saving === provider.id} onClick={() => void act(provider.id, "save")} className="atlas-button-primary disabled:opacity-50">
                      Preparar conexão
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <p className="cc6-panel-quiet px-4 py-3 text-xs leading-5 text-[#6b7890]">
        A ativação final exige OAuth e credenciais configuradas na Hostinger. O Atlas não solicita nem grava tokens nesta tela e não afirma conexão antes da autorização real.
      </p>
    </div>
  );
}
