"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ShellIdentity } from "./shell-types";

const CommandPalette = dynamic(() => import("@/components/CommandPalette"), { ssr: false });
const AtlasNotificationCenter = dynamic(() => import("@/components/AtlasNotificationCenter"), { ssr: false });
const AtlasQuickCreate = dynamic(() => import("@/components/AtlasQuickCreate"), { ssr: false });
const AtlasFeedbackCenter = dynamic(() => import("@/components/AtlasFeedbackCenter"), { ssr: false });
const AtlasCopilotDock = dynamic(() => import("@/components/AtlasCopilotDock"), { ssr: false });

type Surface = "command" | "notifications" | "quickCreate" | "feedback" | "copilot";
type MountedSurfaces = Record<Surface, boolean>;

const initialMounted: MountedSurfaces = {
  command: false,
  notifications: false,
  quickCreate: false,
  feedback: false,
  copilot: false,
};

const eventBySurface: Record<Surface, string> = {
  command: "atlas:open-command-palette",
  notifications: "atlas:open-notifications",
  quickCreate: "atlas:open-quick-create",
  feedback: "atlas:open-feedback",
  copilot: "atlas:open-copilot",
};

type ReplayDetail = Record<string, unknown> & { __atlasLazyReplay?: boolean };

function readDetail(event?: Event): ReplayDetail {
  if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== "object") return {};
  return event.detail as ReplayDetail;
}

export function LazyGlobalSurfaces({
  identity,
}: {
  identity: Pick<ShellIdentity, "role" | "accessRole">;
}) {
  const [mounted, setMounted] = useState<MountedSurfaces>(initialMounted);
  const mountedRef = useRef(mounted);
  const pendingDetail = useRef<Partial<Record<Surface, ReplayDetail>>>({});

  useEffect(() => {
    mountedRef.current = mounted;
  }, [mounted]);

  const openSurface = useCallback((surface: Surface, event?: Event) => {
    const detail = readDetail(event);
    if (detail.__atlasLazyReplay || mountedRef.current[surface]) return;
    pendingDetail.current[surface] = detail;
    setMounted((current) => ({ ...current, [surface]: true }));
  }, []);

  useEffect(() => {
    const removers = (Object.keys(eventBySurface) as Surface[]).map((surface) => {
      const eventName = eventBySurface[surface];
      const listener = (event: Event) => openSurface(surface, event);
      window.addEventListener(eventName, listener);
      return () => window.removeEventListener(eventName, listener);
    });
    const keyboard = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const surface = (event.metaKey || event.ctrlKey) && key === "k" ? "command"
        : (event.metaKey || event.ctrlKey) && key === "j" ? "copilot"
        : (event.metaKey || event.ctrlKey) && event.shiftKey && key === "n" ? "notifications"
        : (event.metaKey || event.ctrlKey) && event.shiftKey && key === "f" ? "feedback"
        : event.altKey && key === "a" ? "quickCreate"
        : null;
      if (surface && !mountedRef.current[surface]) {
        event.preventDefault();
        openSurface(surface, event);
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => {
      removers.forEach((remove) => remove());
      window.removeEventListener("keydown", keyboard);
    };
  }, [openSurface]);

  useEffect(() => {
    const timers: number[] = [];
    (Object.keys(mounted) as Surface[]).forEach((surface) => {
      if (!mounted[surface] || pendingDetail.current[surface] === undefined) return;
      const detail = pendingDetail.current[surface] ?? {};
      delete pendingDetail.current[surface];
      timers.push(window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent(eventBySurface[surface], {
          detail: { ...detail, __atlasLazyReplay: true },
        }));
      }, 0));
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [mounted]);

  return (
    <>
      {!mounted.copilot ? (
        <button type="button" onClick={() => openSurface("copilot")} className="atlas-copilot-launcher" aria-label="Carregar e abrir Atlas Copilot">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-sky-400/20 to-violet-500/20 text-sky-300">✦</span>
          <span><span className="block text-[10px] font-bold uppercase tracking-[.18em] text-sky-300">Atlas Copilot</span><span className="mt-0.5 block max-w-48 truncate text-xs text-slate-400">Próxima melhor ação</span></span>
          <kbd className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-500">⌘J</kbd>
        </button>
      ) : null}
      {!mounted.quickCreate ? (
        <button type="button" onClick={() => openSurface("quickCreate")} className="fixed bottom-5 right-5 z-40 grid h-14 w-14 place-items-center rounded-2xl border border-sky-300/20 bg-gradient-to-br from-sky-400 to-blue-600 text-2xl font-light text-white shadow-[0_18px_60px_rgba(14,165,233,.35)] transition hover:-translate-y-1" aria-label="Carregar criação rápida">+</button>
      ) : null}
      {mounted.command ? <CommandPalette identity={identity} /> : null}
      {mounted.notifications ? <AtlasNotificationCenter /> : null}
      {mounted.quickCreate ? <AtlasQuickCreate /> : null}
      {mounted.feedback ? <AtlasFeedbackCenter /> : null}
      {mounted.copilot ? <AtlasCopilotDock /> : null}
    </>
  );
}
