"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  getAtlasContextCommandsForIdentity,
  getAtlasNavigationForIdentity,
} from "@/lib/atlas/navigation";
import type { ShellIdentity } from "@/components/atlas/shell-types";

/* legacy catalog removed in phase 004
  { label: "Command Center", href: "/dashboard", group: "Operação", keywords: "dashboard inicio indicadores" },
  { label: "Novo lead", href: "/leads/new", group: "Ações", keywords: "cadastrar criar lead contato" },
  { label: "Leads", href: "/leads", group: "Operação", keywords: "clientes contatos oportunidades" },
  { label: "Pipeline", href: "/pipeline", group: "Operação", keywords: "funil kanban vendas" },
  { label: "Clientes", href: "/customers", group: "Operação", keywords: "customer intelligence compradores" },
  { label: "Tarefas", href: "/tasks", group: "Operação", keywords: "follow up pendencias agenda" },
  { label: "Agenda", href: "/calendar", group: "Operação", keywords: "visitas compromissos calendario" },
  { label: "Imóveis", href: "/properties", group: "Launch OS", keywords: "estoque produtos unidades" },
  { label: "Empreendimentos", href: "/developments", group: "Launch OS", keywords: "incorporadoras lancamentos projetos" },
  { label: "Vendas & VGV", href: "/sales", group: "Launch OS", keywords: "receita forecast vendas" },
  { label: "Atlas V2", href: "/atlas-v2", group: "Growth", keywords: "marketing campanhas conversas" },
  { label: "Marketing AI", href: "/marketing", group: "Growth", keywords: "meta criativos campanhas roi" },
  { label: "Conversas", href: "/conversations", group: "Growth", keywords: "whatsapp instagram atendimento" },
  { label: "Centro de Decisão", href: "/decision-center", group: "Intelligence", keywords: "decisoes alertas aprovacoes" },
  { label: "Evolução e homologação V3", href: "/atlas-v3", group: "Intelligence", keywords: "fases percentual progresso agentes digital twin inteligencia homologacao" },
  { label: "Atlas 2030", href: "/atlas-2030", group: "Platform", keywords: "knowledge graph simulacoes plataforma" },
  { label: "Configurações", href: "/settings", group: "Administração", keywords: "empresa preferencias integracoes" },
*/

type Command = { label: string; href: string; group: string; keywords: string };

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export default function CommandPalette({
  identity,
}: {
  identity: Pick<ShellIdentity, "role" | "accessRole">;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [leadCommands, setLeadCommands] = useState<Command[]>([]);
  const [selected, setSelected] = useState(0);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const commands = useMemo<Command[]>(() => [
    ...getAtlasNavigationForIdentity(identity).map((item) => ({
      label: item.label,
      href: item.href,
      group: item.group,
      keywords: item.keywords,
    })),
    ...getAtlasContextCommandsForIdentity(identity).map((item) => ({
      label: item.label,
      href: item.href,
      group: item.group,
      keywords: item.keywords,
    })),
  ], [identity.accessRole, identity.role]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    const handleOpen = () => setOpen(true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("atlas:open-command-palette", handleOpen);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("atlas:open-command-palette", handleOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setLeadCommands([]);
    setSelected(0);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);

  const filtered = useMemo(() => {
    const normalizedQuery = normalize(query);
    const modules = !normalizedQuery ? commands : commands.filter((command) => normalize(`${command.label} ${command.group} ${command.keywords}`).includes(normalizedQuery));
    return [...leadCommands, ...modules];
  }, [commands, leadCommands, query]);

  useEffect(() => {
    const safeQuery = query.replace(/[^\p{L}\p{N}\s@.+()-]/gu, "").trim().slice(0, 80);
    if (!open || safeQuery.length < 2) { setLeadCommands([]); setSearching(false); return; }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      const { data: session } = await supabase.auth.getSession();
      const response = await fetch(`/api/v1/search?q=${encodeURIComponent(safeQuery)}`, { headers: { Authorization: `Bearer ${session.session?.access_token || ""}` }, cache: "no-store" });
      const body = await response.json();
      const results = response.ok ? body.data.results.slice(0, 6) as Array<{ title: string; href: string; reason: string; nextAction: string }> : [];
      setLeadCommands(results.map((lead) => ({ label: lead.title, href: lead.href, group: "Leads da minha carteira", keywords: `${lead.reason} ${lead.nextAction}` })));
      setSearching(false);
      setSelected(0);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  function run(command: Command) {
    setOpen(false);
    router.push(command.href);
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") { event.preventDefault(); setSelected((current) => Math.min(current + 1, filtered.length - 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setSelected((current) => Math.max(current - 1, 0)); }
    if (event.key === "Enter" && filtered[selected]) { event.preventDefault(); run(filtered[selected]); }
  }

  function keepFocusInside(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;

  return (
    <div className="atlas-command-dialog" role="dialog" aria-modal="true" aria-label="Busca global Atlas" onMouseDown={() => setOpen(false)}>
      <div ref={dialogRef} className="atlas-command-dialog-panel" onKeyDown={keepFocusInside} onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-white/[0.08] px-5 py-4">
          <span className="text-sky-300">⌕</span>
          <input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setSelected(0); }} onKeyDown={handleInputKeyDown} placeholder="Buscar nome, telefone, projeto, corretor ou intenção..." className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" role="combobox" aria-expanded="true" aria-controls="atlas-command-results" aria-activedescendant={filtered[selected] ? `atlas-command-${selected}` : undefined} />
          <kbd className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-500">ESC</kbd>
          <button type="button" className="atlas-command-close" onClick={() => setOpen(false)} aria-label="Fechar busca">×</button>
        </div>
        <div id="atlas-command-results" role="listbox" className="max-h-[58vh] overflow-y-auto p-3">
          {filtered.length ? (
            <div className="space-y-1">
              {filtered.map((command, index) => (
                <button id={`atlas-command-${index}`} role="option" aria-selected={selected === index} key={command.href} type="button" onMouseEnter={() => setSelected(index)} onClick={() => run(command)} className={`group flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${selected === index ? "border-sky-400/20 bg-sky-400/[0.09]" : "border-transparent hover:bg-white/[0.035]"}`}>
                  <div>
                    <p className="text-sm font-semibold text-slate-100 group-hover:text-white">{command.label}</p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-600">{command.group}</p>
                  </div>
                  <span className="text-xs text-slate-600 group-hover:text-sky-300">↗</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-4 py-12 text-center">
              <p className="text-sm font-semibold text-slate-300">Nenhum comando encontrado</p>
              <p className="mt-2 text-xs text-slate-600">{searching ? "Consultando sua carteira..." : "Tente nome, telefone, e-mail, projeto, corretor, origem ou intenção."}</p>
            </div>
          )}
        </div>
        <div className="atlas-command-footer flex items-center justify-between border-t border-white/[0.07] px-5 py-3 text-[10px] uppercase tracking-[0.14em] text-slate-600">
          <span>{searching ? "Buscando carteira..." : `${filtered.length} resultado(s)`}</span>
          <span>↑ ↓ navegar · Enter abrir · Esc fechar</span>
        </div>
      </div>
    </div>
  );
}
