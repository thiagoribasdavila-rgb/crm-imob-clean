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
    { name: "Incorporadoras", href: "/developments/developers", icon: "▤" },
    { name: "Materiais", href: "/developments/materials", icon: "◧" },
    { name: "Vendas & VGV", href: "/sales", icon: "↗" },
  ]},
  { title: "Marketing", items: [
    { name: "Campanhas", href: "/marketing/campaigns", icon: "◉" },
    { name: "Criativos", href: "/marketing/creatives", icon: "✣" },
    { name: "Integrações", href: "/integrations", icon: "⊕", external: true },
  ]},
  { title: "Administração", items: [
    { name: "Usuários", href: "/users", icon: "◍" },
    { name: "Equipes", href: "/settings/team", icon: "◇" },
    { name: "Configurações", href: "/settings", icon: "⚙" },
  ]},
];

function isActive(pathname: string, href: string) {
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
            <span><span className="block text-xl font-black tracking-[-.04em] text-white">ATLAS <span className="text-sky-400">ONE</span></span><span className="block text-[9px] font-semibold uppercase tracking-[.22em] text-slate-500">Inteligência comercial</span></span>
          </Link>
        </div>

        <div className="mx-4 mt-4 rounded-2xl border border-cyan-400/15 bg-gradient-to-br from-cyan-500/[.09] via-blue-500/[.08] to-violet-500/[.08] p-4">
          <div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-300">Atlas One</span><span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[9px] font-bold text-emerald-300">ONLINE</span></div>
          <p className="mt-3 text-sm font-semibold text-white">Operação comercial</p>
        </div>

        <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-8" aria-label="Navegação principal">
          <div className="space-y-6">
            {sections.map((section) => <section key={section.title}><p className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[.2em] text-slate-600">{section.title}</p><div className="space-y-1">{section.items.map((item) => { const active = isActive(pathname, item.href); return <Link key={`${section.title}-${item.href}-${item.name}`} href={item.href} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition-all ${active ? "border border-sky-400/15 bg-gradient-to-r from-sky-400/15 to-blue-500/[.06] text-white shadow-[inset_3px_0_0_#38bdf8]" : "border border-transparent text-slate-400 hover:border-white/[0.05] hover:bg-white/[0.035] hover:text-slate-100"}`}><span className={`grid h-7 w-7 place-items-center rounded-lg text-xs ${active ? "bg-sky-400/15 text-sky-300" : "bg-white/[0.03] text-slate-500 group-hover:text-slate-300"}`}>{item.icon}</span><span className="truncate">{item.name}</span>{"external" in item && item.external ? <span className="ml-auto rounded-full bg-amber-400/10 px-1.5 py-0.5 text-[8px] text-amber-200">CONECTAR</span> : null}</Link>; })}</div></section>)}
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
