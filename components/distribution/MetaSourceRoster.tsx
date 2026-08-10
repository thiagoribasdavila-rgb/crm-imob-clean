"use client";

import { useEffect, useMemo, useState } from "react";

type Broker = {
  id: string;
  name: string;
  managerName?: string;
  online?: boolean;
  availability?: string;
};

export function MetaSourceRoster({
  brokers,
  configuredRecipientIds,
  suggestedRecipientIds,
  working,
  onSave,
}: {
  brokers: Broker[];
  configuredRecipientIds: string[];
  suggestedRecipientIds: string[];
  working: boolean;
  onSave: (profileIds: string[]) => Promise<boolean>;
}) {
  const initialIds = useMemo(
    () => configuredRecipientIds.length > 0 ? configuredRecipientIds : suggestedRecipientIds,
    [configuredRecipientIds, suggestedRecipientIds],
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);

  useEffect(() => setSelectedIds(initialIds), [initialIds]);

  const selected = new Set(selectedIds);
  const configured = configuredRecipientIds.length > 0;
  const selectedNames = brokers
    .filter((broker) => selected.has(broker.id))
    .map((broker) => broker.name)
    .join(" e ");

  function toggle(profileId: string) {
    setSelectedIds((current) =>
      current.includes(profileId)
        ? current.filter((id) => id !== profileId)
        : [...current, profileId],
    );
  }

  return (
    <section className="rounded-[26px] border border-sky-300/20 bg-sky-300/[.045] p-5 sm:p-6" data-meta-source-roster>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="atlas-eyebrow text-sky-200">Origem Meta Ads</p>
          <h2 className="mt-1 text-xl font-semibold text-white">Roleta exclusiva de leads da Meta</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            Leads recebidos de Meta Ads só entram na fila dos corretores selecionados abaixo.
            Isso não altera responsáveis de leads já distribuídos.
          </p>
        </div>
        <span
          className={
            configured
              ? "rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-200"
              : "rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-100"
          }
        >
          {configured ? "Regra ativa" : "Aguardando confirmação"}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {brokers.map((broker) => {
          const isSelected = selected.has(broker.id);
          return (
            <label
              key={broker.id}
              className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition ${isSelected ? "border-sky-300/35 bg-sky-300/[.08]" : "border-white/[.08] bg-slate-950/30 hover:border-white/20"}`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(broker.id)}
                className="h-5 w-5 rounded border-white/20 bg-slate-950 accent-sky-400"
              />
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm text-white">{broker.name}</strong>
                <span className="text-xs text-slate-400">
                  {broker.online ? "Online agora" : "Fora da janela de presença"}
                  {broker.managerName ? ` · ${broker.managerName}` : ""}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-white/[.08] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-300">
          {selectedIds.length > 0
            ? `Recebem leads Meta: ${selectedNames || `${selectedIds.length} corretores`}.`
            : "Selecione ao menos um corretor para proteger a captação da Meta."}
        </p>
        <button
          type="button"
          disabled={working || selectedIds.length === 0}
          onClick={() => void onSave(selectedIds)}
          className="atlas-button-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          Salvar roleta Meta
        </button>
      </div>
    </section>
  );
}
