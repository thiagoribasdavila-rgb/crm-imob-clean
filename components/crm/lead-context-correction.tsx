"use client";

import { FormEvent, useState } from "react";
import { AtlasBadge } from "@/components/ui/AtlasUI";

export type LeadContextProjectOption = {
  id: string;
  name: string;
  developer_name: string | null;
  status: string | null;
  city: string | null;
};

type LeadContextCorrectionInput = {
  projectId: string | null;
  source: string | null;
  reason: string;
  humanConfirmed: true;
  expectedProjectId: string | null;
  expectedSource: string | null;
};

type Props = {
  currentProjectId: string | null;
  currentProjectName: string | null;
  currentSource: string | null;
  projects: LeadContextProjectOption[];
  saving: boolean;
  onSubmit: (input: LeadContextCorrectionInput) => Promise<void>;
};

const controlClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-400/40";

export function LeadContextCorrection({
  currentProjectId,
  currentProjectName,
  currentSource,
  projects,
  saving,
  onSubmit,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [projectId, setProjectId] = useState(currentProjectId || "");
  const [source, setSource] = useState(currentSource || "");
  const [reason, setReason] = useState("");
  const [humanConfirmed, setHumanConfirmed] = useState(false);

  const normalizedSource = source.replace(/\s+/g, " ").trim();
  const normalizedCurrentSource = (currentSource || "").replace(/\s+/g, " ").trim() || null;
  const changed = (projectId || null) !== currentProjectId
    || (normalizedSource || null) !== normalizedCurrentSource;
  const valid = changed && reason.trim().length >= 10 && humanConfirmed;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || saving) return;
    try {
      await onSubmit({
        projectId: projectId || null,
        source: normalizedSource || null,
        reason: reason.trim(),
        humanConfirmed: true,
        expectedProjectId: currentProjectId,
        expectedSource: normalizedCurrentSource,
      });
      setEditing(false);
    } catch {
      // A página mantém a mensagem retornada pela API e o formulário aberto para revisão.
    }
  }

  return (
    <section
      id="commercial-context"
      data-phase="87-governed-lead-context-correction"
      className="scroll-mt-28 rounded-2xl border border-cyan-400/15 bg-cyan-400/[.035] p-4 sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="atlas-eyebrow">Contexto comercial atual</p>
            <AtlasBadge tone={currentProjectName && currentSource ? "success" : "warning"}>
              {currentProjectName && currentSource ? "COMPLETO" : "REVISAR"}
            </AtlasBadge>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-white/10 bg-white/[.035] px-3 py-1.5 text-slate-200">
              Projeto: {currentProjectName || "não informado"}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[.035] px-3 py-1.5 text-slate-200">
              Origem: {currentSource || "não informada"}
            </span>
          </div>
          <p className="mt-3 max-w-3xl text-xs leading-5 text-slate-400">
            A correção vale para o estado atual da lead e para confirmações futuras. Resultados e memórias históricas já registrados permanecem imutáveis.
          </p>
        </div>
        <button
          type="button"
          aria-expanded={editing}
          aria-controls="commercial-context-correction-form"
          onClick={() => setEditing((current) => !current)}
          className="atlas-button-secondary shrink-0"
        >
          {editing ? "Cancelar" : "Corrigir contexto"}
        </button>
      </div>

      {editing ? (
        <form id="commercial-context-correction-form" onSubmit={submit} className="mt-5 border-t border-white/[.07] pt-5">
          <fieldset disabled={saving} className="grid gap-4 lg:grid-cols-2">
            <label className="text-xs font-medium text-slate-300">
              Projeto de interesse
              <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className={controlClass}>
                <option value="">Não informado</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}{project.developer_name ? ` · ${project.developer_name}` : ""}{project.status ? ` · ${project.status}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-300">
              Origem atual
              <input
                value={source}
                onChange={(event) => setSource(event.target.value)}
                maxLength={160}
                list="atlas-lead-source-suggestions"
                placeholder="Ex.: Meta Ads, indicação, site"
                className={controlClass}
              />
              <datalist id="atlas-lead-source-suggestions">
                <option value="Meta Lead Ads" />
                <option value="Meta Ads" />
                <option value="WhatsApp" />
                <option value="Site" />
                <option value="Google Ads" />
                <option value="Indicação" />
                <option value="Base histórica" />
              </datalist>
            </label>
            <label className="text-xs font-medium text-slate-300 lg:col-span-2">
              Motivo auditável
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={10}
                maxLength={500}
                required
                placeholder="Ex.: cliente confirmou o projeto na ligação de hoje"
                className={`${controlClass} min-h-24 resize-y`}
              />
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-violet-400/15 bg-violet-400/[.04] p-4 text-xs leading-5 text-slate-300 lg:col-span-2">
              <input
                type="checkbox"
                checked={humanConfirmed}
                onChange={(event) => setHumanConfirmed(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-violet-400"
              />
              <span>Revisei projeto e origem com base em evidência comercial. Entendo que esta ação não altera snapshots históricos.</span>
            </label>
          </fieldset>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] leading-5 text-slate-500">
              A API confirma organização, escopo da lead, projeto e versão atual antes de salvar.
            </p>
            <button type="submit" disabled={!valid || saving} className="atlas-button-primary disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? "Registrando correção..." : "Confirmar correção"}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
