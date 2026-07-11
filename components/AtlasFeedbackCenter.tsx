"use client";

import { FormEvent, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "atlas:feedback:drafts";

type FeedbackDraft = {
  id: string;
  category: "bug" | "ux" | "data" | "performance" | "idea";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  path: string;
  createdAt: string;
  diagnostics: Record<string, string | number | boolean>;
};

function readDrafts(): FeedbackDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? (parsed as FeedbackDraft[]) : [];
  } catch {
    return [];
  }
}

function buildDiagnostics(pathname: string): Record<string, string | number | boolean> {
  if (typeof window === "undefined") return {};

  return {
    path: pathname,
    url: window.location.href,
    online: navigator.onLine,
    language: navigator.language,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    userAgent: navigator.userAgent,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown",
    timestamp: new Date().toISOString(),
  };
}

export default function AtlasFeedbackCenter() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackDraft["category"]>("bug");
  const [severity, setSeverity] = useState<FeedbackDraft["severity"]>("medium");
  const [description, setDescription] = useState("");
  const [drafts, setDrafts] = useState<FeedbackDraft[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDrafts(readDrafts());
    const openPanel = () => setOpen(true);
    window.addEventListener("atlas:open-feedback", openPanel);
    return () => window.removeEventListener("atlas:open-feedback", openPanel);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function persist(next: FeedbackDraft[]) {
    setDrafts(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Local storage may be unavailable in restricted browser modes.
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (description.trim().length < 8) return;

    const draft: FeedbackDraft = {
      id: crypto.randomUUID(),
      category,
      severity,
      description: description.trim(),
      path: pathname,
      createdAt: new Date().toISOString(),
      diagnostics: buildDiagnostics(pathname),
    };

    persist([draft, ...drafts].slice(0, 50));
    setDescription("");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  async function copyDraft(draft: FeedbackDraft) {
    await navigator.clipboard.writeText(JSON.stringify(draft, null, 2));
  }

  function exportAll() {
    const blob = new Blob([JSON.stringify(drafts, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `atlas-feedback-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(href);
  }

  if (!open) return null;

  const fieldClass = "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition focus:border-sky-400/40";

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/55 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Feedback de produção">
      <button className="absolute inset-0 cursor-default" onClick={() => setOpen(false)} aria-label="Fechar painel" />
      <aside className="relative h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[#070b14]/95 p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="atlas-eyebrow">Production feedback</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Registrar ajuste</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Capture erros, melhorias e ideias junto com o contexto técnico da tela.</p>
          </div>
          <button onClick={() => setOpen(false)} className="atlas-icon-button" aria-label="Fechar">×</button>
        </div>

        <form onSubmit={submit} className="mt-7 space-y-4 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-xs text-slate-400">Categoria
              <select className={fieldClass} value={category} onChange={(event) => setCategory(event.target.value as FeedbackDraft["category"])}>
                <option value="bug">Erro</option><option value="ux">Experiência</option><option value="data">Dados</option><option value="performance">Performance</option><option value="idea">Ideia</option>
              </select>
            </label>
            <label className="space-y-2 text-xs text-slate-400">Prioridade
              <select className={fieldClass} value={severity} onChange={(event) => setSeverity(event.target.value as FeedbackDraft["severity"])}>
                <option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option><option value="critical">Crítica</option>
              </select>
            </label>
          </div>
          <label className="block space-y-2 text-xs text-slate-400">Descrição
            <textarea required minLength={8} rows={6} className={fieldClass} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descreva o que aconteceu, o resultado esperado e como reproduzir." />
          </label>
          <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3 text-xs text-slate-500">
            Contexto incluído automaticamente: rota, navegador, viewport, conexão, idioma e horário.
          </div>
          <button className="atlas-button-primary w-full" disabled={description.trim().length < 8}>{saved ? "Registrado com sucesso" : "Salvar registro"}</button>
        </form>

        <div className="mt-8 flex items-center justify-between gap-3">
          <div><p className="text-sm font-semibold text-white">Registros desta máquina</p><p className="mt-1 text-xs text-slate-500">{drafts.length} item(ns) armazenado(s)</p></div>
          {drafts.length ? <button onClick={exportAll} className="atlas-button-secondary">Exportar JSON</button> : null}
        </div>

        <div className="mt-4 space-y-3">
          {drafts.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-500">Nenhum registro criado ainda.</div> : drafts.slice(0, 8).map((draft) => (
            <article key={draft.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
              <div className="flex items-center justify-between gap-3"><div className="flex gap-2"><span className="atlas-badge atlas-badge-info">{draft.category}</span><span className={`atlas-badge ${draft.severity === "critical" ? "atlas-badge-danger" : draft.severity === "high" ? "atlas-badge-warning" : "atlas-badge-neutral"}`}>{draft.severity}</span></div><button onClick={() => copyDraft(draft)} className="text-xs font-semibold text-sky-300">Copiar</button></div>
              <p className="mt-3 text-sm leading-6 text-slate-300">{draft.description}</p>
              <p className="mt-3 text-[11px] text-slate-600">{draft.path} · {new Date(draft.createdAt).toLocaleString("pt-BR")}</p>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}
