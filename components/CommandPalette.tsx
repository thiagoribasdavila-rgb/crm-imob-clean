"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const commands = [
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
];

export default function CommandPalette() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return commands;
    return commands.filter((command) =>
      `${command.label} ${command.group} ${command.keywords}`.toLowerCase().includes(normalized),
    );
  }, [query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/65 px-4 pt-[12vh] backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Paleta de comandos Atlas" onMouseDown={() => setOpen(false)}>
      <div className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/10 bg-[#090d18]/95 shadow-[0_30px_100px_rgba(0,0,0,.65)]" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-white/[0.08] px-5 py-4">
          <span className="text-sky-300">⌕</span>
          <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar módulos, ações e inteligência..." className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" />
          <kbd className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-500">ESC</kbd>
        </div>
        <div className="max-h-[58vh] overflow-y-auto p-3">
          {filtered.length ? (
            <div className="space-y-1">
              {filtered.map((command) => (
                <Link key={command.href} href={command.href} className="group flex items-center justify-between rounded-2xl border border-transparent px-4 py-3 transition hover:border-sky-400/15 hover:bg-sky-400/[0.08]">
                  <div>
                    <p className="text-sm font-semibold text-slate-100 group-hover:text-white">{command.label}</p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-600">{command.group}</p>
                  </div>
                  <span className="text-xs text-slate-600 group-hover:text-sky-300">↗</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="px-4 py-12 text-center">
              <p className="text-sm font-semibold text-slate-300">Nenhum comando encontrado</p>
              <p className="mt-2 text-xs text-slate-600">Tente buscar por lead, lançamento, campanha ou decisão.</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-white/[0.07] px-5 py-3 text-[10px] uppercase tracking-[0.14em] text-slate-600">
          <span>Atlas Global Navigation</span>
          <span>⌘K / Ctrl K</span>
        </div>
      </div>
    </div>
  );
}
