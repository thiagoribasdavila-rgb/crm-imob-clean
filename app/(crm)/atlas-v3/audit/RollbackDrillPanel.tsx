"use client";

import { useEffect, useState } from "react";
import { AtlasBadge } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader } from "@/components/ui/AtlasCard";
import { supabase } from "@/lib/supabase";

type Backup = {
  id: string;
  provider: string;
  snapshot_reference: string;
};

type Drill = {
  id: string;
  target_release_url: string;
  status: "passed" | "failed";
  duration_minutes: number;
  health_check_status: number;
  evidence_reference: string;
};

type Form = {
  backupEvidenceId: string;
  targetReleaseUrl: string;
  releaseVersion: string;
  artifactReference: string;
  storageEvidenceReference: string;
  startedAt: string;
  completedAt: string;
  status: "passed" | "failed";
  healthCheckStatus: string;
  evidenceReference: string;
  notes: string;
};

const empty: Form = {
  backupEvidenceId: "",
  targetReleaseUrl: "",
  releaseVersion: "",
  artifactReference: "",
  storageEvidenceReference: "",
  startedAt: "",
  completedAt: "",
  status: "passed",
  healthCheckStatus: "200",
  evidenceReference: "",
  notes: "",
};

export function RollbackDrillPanel() {
  const [plan, setPlan] = useState<string[]>([]);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [drills, setDrills] = useState<Drill[]>([]);
  const [form, setForm] = useState<Form>(empty);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function request(init?: RequestInit) {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error("Sessão expirada.");
    const response = await fetch("/api/v1/governance/rollback", {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session.access_token}`,
        ...(init?.headers || {}),
      },
    });
    const body = await response.json();
    if (!response.ok)
      throw new Error(
        body.error?.message || "Falha ao carregar a recuperação.",
      );
    return body.data;
  }

  async function load() {
    const data = await request();
    setPlan(data.plan);
    setBackups(data.eligibleBackups);
    setDrills(data.drills);
  }

  useEffect(() => {
    void load().catch((cause) =>
      setError(
        cause instanceof Error
          ? cause.message
          : "Falha ao carregar a recuperação.",
      ),
    );
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await request({ method: "POST", body: JSON.stringify(form) });
      setForm(empty);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Falha ao registrar o ensaio.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AtlasCard>
      <AtlasCardHeader
        eyebrow="Continuidade do V3"
        title="Ensaio de retorno para a versão anterior"
        description="Valide o pacote anterior do V3, a restauração do banco e os arquivos do Storage. O V2 histórico não é aceito como plano de recuperação."
      />
      <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-[.8fr_1.2fr]">
        <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5">
          <div className="text-xs font-semibold uppercase tracking-[.16em] text-sky-300">
            Plano controlado
          </div>
          <ol className="mt-4 space-y-3">
            {plan.map((step, index) => (
              <li
                key={step}
                className="flex gap-3 text-xs leading-5 text-slate-300"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-400/10 text-sky-300">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <div className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/[.06] p-4 text-xs leading-5 text-amber-100/80">
            O snapshot do banco e os arquivos enviados ao Storage exigem
            evidências separadas. Sem os dois, a recuperação permanece
            pendente.
          </div>
        </div>

        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs text-slate-400">
            Banco restaurado
            <select
              required
              value={form.backupEvidenceId}
              onChange={(event) =>
                setForm({ ...form, backupEvidenceId: event.target.value })
              }
              className="atlas-input mt-2 w-full"
            >
              <option value="">Selecione</option>
              {backups.map((backup) => (
                <option key={backup.id} value={backup.id}>
                  {backup.provider} · {backup.snapshot_reference}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Versão anterior do V3
            <input
              required
              value={form.releaseVersion}
              onChange={(event) =>
                setForm({ ...form, releaseVersion: event.target.value })
              }
              className="atlas-input mt-2 w-full"
              placeholder="v3.0.0-rc.2 ou commit"
            />
          </label>
          <label className="text-xs text-slate-400 sm:col-span-2">
            URL HTTPS da versão anterior
            <input
              required
              type="url"
              value={form.targetReleaseUrl}
              onChange={(event) =>
                setForm({ ...form, targetReleaseUrl: event.target.value })
              }
              className="atlas-input mt-2 w-full"
              placeholder="https://versao-anterior..."
            />
          </label>
          <label className="text-xs text-slate-400">
            Pacote imutável
            <input
              required
              value={form.artifactReference}
              onChange={(event) =>
                setForm({ ...form, artifactReference: event.target.value })
              }
              className="atlas-input mt-2 w-full"
              placeholder="ZIP + SHA-256 ou release"
            />
          </label>
          <label className="text-xs text-slate-400">
            Evidência dos arquivos
            <input
              required
              value={form.storageEvidenceReference}
              onChange={(event) =>
                setForm({
                  ...form,
                  storageEvidenceReference: event.target.value,
                })
              }
              className="atlas-input mt-2 w-full"
              placeholder="Inventário ou relatório do Storage"
            />
          </label>
          <label className="text-xs text-slate-400">
            Início
            <input
              required
              type="datetime-local"
              value={form.startedAt}
              onChange={(event) =>
                setForm({ ...form, startedAt: event.target.value })
              }
              className="atlas-input mt-2 w-full"
            />
          </label>
          <label className="text-xs text-slate-400">
            Conclusão
            <input
              required
              type="datetime-local"
              value={form.completedAt}
              onChange={(event) =>
                setForm({ ...form, completedAt: event.target.value })
              }
              className="atlas-input mt-2 w-full"
            />
          </label>
          <label className="text-xs text-slate-400">
            Resultado
            <select
              value={form.status}
              onChange={(event) =>
                setForm({
                  ...form,
                  status: event.target.value as Form["status"],
                })
              }
              className="atlas-input mt-2 w-full"
            >
              <option value="passed">Aprovado</option>
              <option value="failed">Falhou</option>
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Resposta HTTP
            <input
              required
              type="number"
              min="100"
              max="599"
              value={form.healthCheckStatus}
              onChange={(event) =>
                setForm({ ...form, healthCheckStatus: event.target.value })
              }
              className="atlas-input mt-2 w-full"
            />
          </label>
          <label className="text-xs text-slate-400 sm:col-span-2">
            Evidência do ensaio
            <input
              required
              value={form.evidenceReference}
              onChange={(event) =>
                setForm({ ...form, evidenceReference: event.target.value })
              }
              className="atlas-input mt-2 w-full"
              placeholder="Relatório, chamado ou vídeo protegido"
            />
          </label>
          <label className="text-xs text-slate-400 sm:col-span-2">
            Observações
            <input
              value={form.notes}
              onChange={(event) =>
                setForm({ ...form, notes: event.target.value })
              }
              className="atlas-input mt-2 w-full"
            />
          </label>
          {error ? (
            <div className="text-xs text-rose-300 sm:col-span-2">{error}</div>
          ) : null}
          <div className="sm:col-span-2">
            <button
              disabled={saving || !backups.length}
              className="atlas-button-primary"
            >
              {saving ? "Registrando…" : "Registrar ensaio"}
            </button>
            {!backups.length ? (
              <p className="mt-2 text-xs text-amber-300">
                Primeiro comprove uma restauração isolada do banco.
              </p>
            ) : null}
          </div>
        </form>
      </div>

      <div className="divide-y divide-white/[.06] border-t border-white/[.06]">
        {drills.map((drill) => (
          <div
            key={drill.id}
            className="grid gap-2 p-5 md:grid-cols-[1fr_auto_auto] md:items-center sm:p-6"
          >
            <div>
              <div className="text-sm font-medium text-white">
                {drill.target_release_url}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {drill.evidence_reference} · versão atual preservada
              </div>
            </div>
            <div className="text-xs text-slate-400">
              HTTP {drill.health_check_status} · {drill.duration_minutes} min
            </div>
            <AtlasBadge
              tone={drill.status === "passed" ? "success" : "danger"}
            >
              {drill.status === "passed" ? "APROVADO" : "FALHOU"}
            </AtlasBadge>
          </div>
        ))}
        {!drills.length ? (
          <div className="p-6 text-center text-sm text-slate-500">
            Nenhum rollback entre versões do V3 foi comprovado.
          </div>
        ) : null}
      </div>
    </AtlasCard>
  );
}
