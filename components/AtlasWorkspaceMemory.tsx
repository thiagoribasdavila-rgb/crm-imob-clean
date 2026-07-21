"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

// Chave global LEGADA — podia conter leads de OUTRO usuário no mesmo navegador
// (vazamento entre escopos / LGPD). Purgada no mount; a memória agora é por usuário.
const LEGACY_STORAGE_KEY = "atlas:workspace-memory:v1";
const keyFor = (userId: string) => `atlas:workspace-memory:v1:${userId}`;

type WorkspaceItem = {
  path: string;
  label: string;
  visitedAt: string;
  favorite?: boolean;
};

const labels: Record<string, string> = {
  "/dashboard": "Command Center",
  "/leads": "Leads",
  "/leads/new": "Novo lead",
  "/pipeline": "Pipeline",
  "/customers": "Customer Intelligence",
  "/properties": "Imóveis",
  "/developments": "Empreendimentos",
  "/sales": "Vendas",
  "/calendar": "Agenda",
  "/tasks": "Tarefas",
  "/marketing": "Marketing Intelligence",
  "/reports": "Analytics",
  "/intelligence": "Atlas Intelligence",
  "/decision-center": "Centro de Decisão",
  "/atlas-v2": "Atlas V2",
  "/atlas-v3": "Atlas V3",
  "/atlas-2030": "Atlas 2030",
};

function getLabel(path: string) {
  const exact = labels[path];
  if (exact) return exact;
  const match = Object.keys(labels)
    .sort((a, b) => b.length - a.length)
    .find((key) => path.startsWith(`${key}/`));
  if (match === "/leads") return "Lead 360";
  return match ? labels[match] : "Atlas Workspace";
}

function readMemory(key: string): WorkspaceItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]") as WorkspaceItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function AtlasWorkspaceMemory() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<WorkspaceItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  // Resolve o usuário e PURGA a chave global legada (sem migrar — podia ser de
  // outro usuário). No logout, limpa o painel e remove a chave da sessão que saiu.
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // localStorage indisponível — segue sem memória persistida
    }
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setUserId(data.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        const previous = userIdRef.current;
        if (previous) {
          try {
            localStorage.removeItem(keyFor(previous));
          } catch {
            // ignore
          }
        }
        setItems([]);
        setUserId(null);
      } else {
        setUserId(session?.user?.id ?? null);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Carrega a memória DO USUÁRIO ATUAL (nunca a global) quando o usuário muda.
  useEffect(() => {
    if (!userId) {
      setItems([]);
      return;
    }
    setItems(readMemory(keyFor(userId)));
  }, [userId]);

  // Rastreia navegação — só grava com userId definido (nunca em chave global/errada).
  useEffect(() => {
    if (!userId || !pathname || pathname === "/") return;
    setItems((current) => {
      const previous = current.find((item) => item.path === pathname);
      const next: WorkspaceItem[] = [
        {
          path: pathname,
          label: getLabel(pathname),
          visitedAt: new Date().toISOString(),
          favorite: previous?.favorite ?? false,
        },
        ...current.filter((item) => item.path !== pathname),
      ].slice(0, 20);
      try {
        localStorage.setItem(keyFor(userId), JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, [pathname, userId]);

  useEffect(() => {
    const openPanel = () => setOpen(true);
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "h") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("atlas:open-workspace-memory", openPanel);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("atlas:open-workspace-memory", openPanel);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const favorites = useMemo(() => items.filter((item) => item.favorite), [items]);
  const recents = useMemo(() => items.filter((item) => !item.favorite).slice(0, 8), [items]);

  function persist(next: WorkspaceItem[]) {
    if (!userId) return;
    try {
      localStorage.setItem(keyFor(userId), JSON.stringify(next));
    } catch {
      // localStorage indisponível — mantém só em memória
    }
  }

  function toggleFavorite(path: string) {
    setItems((current) => {
      const next = current.map((item) =>
        item.path === path ? { ...item, favorite: !item.favorite } : item,
      );
      persist(next);
      return next;
    });
  }

  function clearRecents() {
    setItems((current) => {
      const next = current.filter((item) => item.favorite);
      persist(next);
      return next;
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-black/55 backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
      <aside
        className="h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-[#070b14]/95 p-5 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
        aria-label="Memória do workspace"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="atlas-eyebrow">Workspace memory</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Continue de onde parou</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Acesse rapidamente páginas recentes e mantenha seus fluxos favoritos fixados.</p>
          </div>
          <button className="atlas-icon-button" onClick={() => setOpen(false)} aria-label="Fechar">×</button>
        </div>

        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Favoritos</h3>
            <span className="text-xs text-slate-500">{favorites.length}</span>
          </div>
          <div className="mt-3 space-y-2">
            {favorites.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-slate-500">Fixe os fluxos mais importantes usando a estrela.</div>
            ) : favorites.map((item) => (
              <div key={item.path} className="flex items-center gap-2 rounded-2xl border border-amber-300/10 bg-amber-300/[0.04] p-2">
                <Link href={item.path} onClick={() => setOpen(false)} className="min-w-0 flex-1 rounded-xl px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/[0.04]">{item.label}<span className="mt-1 block truncate text-[11px] font-normal text-slate-500">{item.path}</span></Link>
                <button onClick={() => toggleFavorite(item.path)} className="atlas-icon-button" aria-label="Remover dos favoritos">★</button>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Recentes</h3>
            <button onClick={clearRecents} className="text-xs font-medium text-slate-500 transition hover:text-slate-300">Limpar</button>
          </div>
          <div className="mt-3 space-y-2">
            {recents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-slate-500">Sua navegação recente aparecerá aqui.</div>
            ) : recents.map((item) => (
              <div key={item.path} className="flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-2">
                <Link href={item.path} onClick={() => setOpen(false)} className="min-w-0 flex-1 rounded-xl px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/[0.04]">{item.label}<span className="mt-1 block truncate text-[11px] font-normal text-slate-500">{new Date(item.visitedAt).toLocaleString("pt-BR")}</span></Link>
                <button onClick={() => toggleFavorite(item.path)} className="atlas-icon-button" aria-label="Adicionar aos favoritos">☆</button>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-8 rounded-2xl border border-sky-400/10 bg-sky-400/[0.04] p-4 text-xs leading-5 text-slate-400">
          Atalho: <kbd className="rounded border border-white/10 bg-black/20 px-1.5 py-0.5 text-slate-300">⌘⇧H</kbd> no Mac ou <kbd className="rounded border border-white/10 bg-black/20 px-1.5 py-0.5 text-slate-300">Ctrl⇧H</kbd> no Windows.
        </div>
      </aside>
    </div>
  );
}
