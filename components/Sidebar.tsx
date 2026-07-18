"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  { title: "Operação", items: [
    { name: "Command Center", href: "/dashboard", icon: "◫" },
    { name: "Leads", href: "/leads", icon: "◎" },
    { name: "Pipeline", href: "/pipeline", icon: "⌁" },
    { name: "Clientes", href: "/customers", icon: "◇" },
    { name: "Tarefas", href: "/tasks", icon: "✓" },
    { name: "Agenda", href: "/calendar", icon: "□" },
    { name: "Lembretes", href: "/notifications", icon: "◔" },
  ]},
  { title: "Imobiliário", items: [
    { name: "Imóveis", href: "/properties", icon: "⌂" },
    { name: "Empreendimentos", href: "/developments", icon: "▥" },
    { name: "Vendas & VGV", href: "/sales", icon: "↗" },
  ]},
  { title: "Atlas V2 · Growth Layer", items: [
    { name: "V2 Overview", href: "/atlas-v2", icon: "✺" },
    { name: "Marketing AI", href: "/marketing", icon: "◉" },
    { name: "Conversas", href: "/conversations", icon: "◍" },
    { name: "Criativos", href: "/creatives", icon: "✣" },
    { name: "Automações", href: "/automations", icon: "⚡" },
    { name: "Aprovações", href: "/approvals", icon: "✓" },
    { name: "Integrações", href: "/integrations", icon: "⊕" },
  ]},
  { title: "Intelligence Layer", items: [
    { name: "Centro de decisão", href: "/decision-center", icon: "✦" },
    { name: "Atlas Intelligence", href: "/intelligence", icon: "◈" },
    { name: "Analytics", href: "/reports", icon: "⌁" },
  ]},
  { title: "Atlas OS V3", items: [
    { name: "V3 Overview", href: "/atlas-v3", icon: "✧" },
    { name: "Digital Twin", href: "/atlas-v3/digital-twin", icon: "◌" },
    { name: "Agentes", href: "/atlas-v3/agents", icon: "⬡" },
    { name: "Market Intelligence", href: "/atlas-v3/market", icon: "⌖" },
    { name: "Forecast", href: "/atlas-v3/forecast", icon: "∿" },
    { name: "Aging do pipeline", href: "/atlas-v3/pipeline-aging", icon: "◷" },
    { name: "Velocidade do funil", href: "/atlas-v3/funnel-velocity", icon: "↝" },
    { name: "Marketplace", href: "/atlas-v3/marketplace", icon: "◧" },
    { name: "Investor", href: "/atlas-v3/investor", icon: "△" },
    { name: "Incorporadoras", href: "/atlas-v3/developer", icon: "▤" },
    { name: "Governança", href: "/atlas-v3/governance", icon: "◐" },
    { name: "Auditoria", href: "/atlas-v3/audit", icon: "≡" },
    { name: "Data Quality", href: "/atlas-v3/data-quality", icon: "◆" },
    { name: "Cenários", href: "/atlas-v3/scenarios", icon: "∞" },
  ]},
  { title: "Atlas 2030 · Platform Layer", items: [
    { name: "2030 Command Center", href: "/atlas-2030", icon: "✹" },
    { name: "Launch Commerce", href: "/atlas-v3/developer", icon: "⬢" },
    { name: "Simulações", href: "/atlas-v3/scenarios", icon: "∞" },
    { name: "Knowledge Graph", href: "/atlas-2030", icon: "⌘" },
  ]},
  { title: "Administração", items: [
    { name: "Usuários", href: "/users", icon: "◍" },
    { name: "Configurações", href: "/settings", icon: "⚙" },
  ]},
];

function isActive(pathname: string, href: string) {
  if (href === "/atlas-v2" || href === "/atlas-v3" || href === "/atlas-2030") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[292px] border-r border-white/[0.07] bg-[#060a14]/95 lg:flex lg:flex-col lg:backdrop-blur-2xl">
        <div className="border-b border-white/[0.07] px-6 py-6">
          <Link href="/dashboard" className="group flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl border border-sky-400/20 bg-gradient-to-br from-sky-400/20 to-violet-500/15 text-lg font-black text-sky-300 shadow-[0_0_28px_rgba(56,189,248,.12)]">A</span>
            <span><span className="block text-xl font-black tracking-[-.04em] text-white">ATLAS <span className="text-sky-400">AI</span></span><span className="block text-[9px] font-semibold uppercase tracking-[.22em] text-slate-500">Inteligência comercial</span></span>
          </Link>
        </div>

        <div className="mx-4 mt-4 rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-cyan-500/[.09] via-blue-500/[.08] to-violet-500/[.08] p-4">
          <div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-300">Atlas 2030</span><span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[9px] font-bold text-emerald-300">ACTIVE</span></div>
          <p className="mt-3 text-sm font-semibold text-white">Launch & Intelligence Platform</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full w-[96%] rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 shadow-[0_0_14px_rgba(59,130,246,.7)]" /></div>
          <div className="mt-2 flex justify-between text-[10px] text-slate-500"><span>Technical foundation</span><span>96%</span></div>
        </div>

        <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-8" aria-label="Navegação principal">
          <div className="space-y-6">
            {sections.map((section) => <section key={section.title}><p className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[.2em] text-slate-600">{section.title}</p><div className="space-y-1">{section.items.map((item) => { const active = isActive(pathname, item.href); return <Link key={`${section.title}-${item.href}-${item.name}`} href={item.href} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition-all ${active ? "border border-sky-400/15 bg-gradient-to-r from-sky-400/15 to-blue-500/[.06] text-white shadow-[inset_3px_0_0_#38bdf8]" : "border border-transparent text-slate-400 hover:border-white/[0.05] hover:bg-white/[0.035] hover:text-slate-100"}`}><span className={`grid h-7 w-7 place-items-center rounded-lg text-xs ${active ? "bg-sky-400/15 text-sky-300" : "bg-white/[0.03] text-slate-500 group-hover:text-slate-300"}`}>{item.icon}</span><span className="truncate">{item.name}</span></Link>; })}</div></section>)}
          </div>
        </nav>

        <div className="border-t border-white/[0.07] p-4"><div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-sky-400/20 to-violet-500/20 text-xs font-bold text-sky-200">OS</span><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-200">Atlas Cloud</p><p className="text-[10px] text-slate-500">Secure multi-tenant</p></div><span className="ml-auto h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.7)]" /></div></div></div>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-white/[0.08] bg-[#060a14]/95 p-2 backdrop-blur-2xl lg:hidden">
        {sections[0].items.slice(0, 5).map((item) => { const active = isActive(pathname, item.href); return <Link key={item.href} href={item.href} className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[9px] ${active ? "bg-sky-400/10 text-sky-300" : "text-slate-500"}`}><span className="text-sm">{item.icon}</span><span className="max-w-full truncate">{item.name}</span></Link>; })}
      </nav>
    </>
  );
}
