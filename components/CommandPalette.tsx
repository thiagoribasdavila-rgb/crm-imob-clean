"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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

type Command = { label: string; href: string; group: string; keywords: string };

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export default function CommandPalette() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [leadCommands, setLeadCommands] = useState<Command[]>([]);
  const [selected, setSelected] = useState(0);
  const [searching, setSearching] = useState(false);
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
    setLeadCommands([]);
    setSelected(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);

  const filtered = useMemo(() => {
    const normalizedQuery = normalize(query);
    const modules = !normalizedQuery ? commands : commands.filter((command) => normalize(`${command.label} ${command.group} ${command.keywords}`).includes(normalizedQuery));
    return [...leadCommands, ...modules];
  }, [leadCommands, query]);

  useEffect(() => {
    const safeQuery = query.replace(/[^\p{L}\p{N}\s@.+()-]/gu, "").trim().slice(0, 80);
    if (!open || safeQuery.length < 2) { setLeadCommands([]); setSearching(false); return; }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      const digits = safeQuery.replace(/\D/g, "");
      const filter = digits.length >= 4 ? `name.ilike.%${safeQuery}%,email.ilike.%${safeQuery}%,phone.ilike.%${digits}%` : `name.ilike.%${safeQuery}%,email.ilike.%${safeQuery}%`;
      const { data } = await supabase.from("leads").select("id,name,status,phone").or(filter).order("updated_at", { ascending: false }).limit(6);
      setLeadCommands((data ?? []).map((lead) => ({ label: lead.name || "Lead sem nome", href: `/leads/${lead.id}`, group: "Leads da minha carteira", keywords: `${lead.status || ""} ${String(lead.phone || "").slice(-4)}` })));
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/65 px-4 pt-[12vh] backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Paleta de comandos Atlas" onMouseDown={() => setOpen(false)}>
      <div className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/10 bg-[#090d18]/95 shadow-[0_30px_100px_rgba(0,0,0,.65)]" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-white/[0.08] px-5 py-4">
          <span className="text-sky-300">⌕</span>
          <input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setSelected(0); }} onKeyDown={handleInputKeyDown} placeholder="Buscar lead, telefone, módulo ou ação..." className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" role="combobox" aria-expanded="true" aria-controls="atlas-command-results" aria-activedescendant={filtered[selected] ? `atlas-command-${selected}` : undefined} />
          <kbd className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-500">ESC</kbd>
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
              <p className="mt-2 text-xs text-slate-600">{searching ? "Consultando sua carteira..." : "Tente buscar por nome, telefone, lançamento, campanha ou decisão."}</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-white/[0.07] px-5 py-3 text-[10px] uppercase tracking-[0.14em] text-slate-600">
          <span>{searching ? "Buscando carteira..." : `${filtered.length} resultado(s)`}</span>
          <span>↑ ↓ navegar · Enter abrir · Esc fechar</span>
        </div>
      </div>
    </div>
  );
}
