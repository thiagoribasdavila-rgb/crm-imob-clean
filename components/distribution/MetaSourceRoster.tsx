"use client";

import { useEffect, useMemo, useState } from "react";

type Broker = {
  id: string;
  name: string;
  managerName?: string;
  online?: boolean;
  availability?: string;
};

export type MetaRosterMember = {
  profileId: string;
  weight: number;
};

function normalizeMembers(members: MetaRosterMember[]) {
  return [...members]
    .map((member) => ({ ...member, weight: Math.min(10, Math.max(1, member.weight)) }))
    .sort((left, right) => left.profileId.localeCompare(right.profileId));
}

export function MetaSourceRoster({
  brokers,
  configuredRecipients,
  suggestedRecipientIds,
  working,
  onSave,
}: {
  brokers: Broker[];
  configuredRecipients: MetaRosterMember[];
  suggestedRecipientIds: string[];
  working: boolean;
  onSave: (members: MetaRosterMember[]) => Promise<boolean>;
}) {
  const initialMembers = useMemo(
    () => normalizeMembers(
      configuredRecipients.length > 0
        ? configuredRecipients
        : suggestedRecipientIds.map((profileId) => ({ profileId, weight: 1 })),
    ),
    [configuredRecipients, suggestedRecipientIds],
  );
  const [members, setMembers] = useState<MetaRosterMember[]>(initialMembers);

  useEffect(() => setMembers(initialMembers), [initialMembers]);

  const selected = new Set(members.map((member) => member.profileId));
  const configured = configuredRecipients.length > 0;
  const dirty = JSON.stringify(normalizeMembers(members)) !== JSON.stringify(normalizeMembers(configuredRecipients));
  const selectedNames = brokers
    .filter((broker) => selected.has(broker.id))
    .map((broker) => broker.name)
    .join(" e ");

  function toggle(profileId: string) {
    setMembers((current) =>
      current.some((member) => member.profileId === profileId)
        ? current.filter((member) => member.profileId !== profileId)
        : [...current, { profileId, weight: 1 }],
    );
  }

  function setWeight(profileId: string, weight: number) {
    setMembers((current) => current.map((member) =>
      member.profileId === profileId ? { ...member, weight } : member,
    ));
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
            <div
              key={broker.id}
              className={`flex items-center gap-3 rounded-2xl border p-4 transition ${isSelected ? "border-sky-300/35 bg-sky-300/[.08]" : "border-white/[.08] bg-slate-950/30 hover:border-white/20"}`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(broker.id)}
                aria-label={`Incluir ${broker.name} na roleta Meta`}
                className="h-5 w-5 cursor-pointer rounded border-white/20 bg-slate-950 accent-sky-400"
              />
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm text-white">{broker.name}</strong>
                <span className="text-xs text-slate-400">
                  {broker.online ? "Online agora" : "Fora da janela de presença"}
                  {broker.managerName ? ` · ${broker.managerName}` : ""}
                </span>
              </span>
              {isSelected ? (
                <span className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[.12em] text-slate-500">Peso</span>
                  <select
                    aria-label={`Peso de ${broker.name} na roleta Meta`}
                    value={members.find((member) => member.profileId === broker.id)?.weight ?? 1}
                    onChange={(event) => setWeight(broker.id, Number(event.target.value))}
                    className="rounded-xl border border-white/10 bg-slate-950 px-2 py-1.5 text-sm font-semibold text-white"
                  >
                    {Array.from({ length: 10 }, (_, index) => index + 1).map((weight) => (
                      <option key={weight} value={weight}>{weight}</option>
                    ))}
                  </select>
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-white/[.08] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-300">
          {members.length > 0
            ? `Recebem leads Meta: ${selectedNames || `${members.length} corretores`}. Pesos maiores aumentam a participação relativa, respeitando presença e capacidade.`
            : "Selecione ao menos um corretor para proteger a captação da Meta."}
        </p>
        <button
          type="button"
          disabled={working || members.length === 0 || !dirty}
          onClick={() => void onSave(normalizeMembers(members))}
          className="atlas-button-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {working ? "Salvando…" : dirty ? "Salvar roleta Meta" : "Alterações salvas"}
        </button>
      </div>
    </section>
  );
}
