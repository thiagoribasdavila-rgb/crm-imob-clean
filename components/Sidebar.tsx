"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  {
    title: "Operação",
    items: [
      { name: "Dashboard", href: "/dashboard" },
      { name: "Leads", href: "/leads" },
      { name: "Pipeline", href: "/pipeline" },
      { name: "Clientes", href: "/customers" },
      { name: "Tarefas", href: "/tasks" },
    ],
  },
  {
    title: "Imobiliário",
    items: [
      { name: "Imóveis", href: "/properties" },
      { name: "Empreendimentos", href: "/developments" },
      { name: "Vendas", href: "/sales" },
    ],
  },
  {
    title: "Inteligência",
    items: [
      { name: "Atlas Intelligence", href: "/intelligence" },
      { name: "Marketing", href: "/marketing" },
      { name: "Relatórios", href: "/reports" },
    ],
  },
  {
    title: "Administração",
    items: [
      { name: "Integrações", href: "/integrations" },
      { name: "Usuários", href: "/users" },
      { name: "Configurações", href: "/settings" },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-4 backdrop-blur lg:hidden">
        <Link href="/dashboard" className="font-black tracking-tight">
          ATLAS <span className="text-blue-400">AI</span>
        </Link>
        <span className="rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-1 text-xs text-fuchsia-300">V3 Build</span>
      </header>

      <aside className="hidden min-h-screen w-72 shrink-0 border-r border-zinc-800 bg-zinc-950 p-6 lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto">
        <div className="mb-8">
          <Link href="/dashboard" className="text-2xl font-black tracking-tight text-white">ATLAS <span className="text-blue-400">AI</span></Link>
          <p className="mt-1 text-xs text-zinc-500">Real Estate Operating System</p>
        </div>

        <div className="mb-8 rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-300">Construção V3</p>
          <p className="mt-2 text-sm font-semibold text-white">Core operacional + inteligência</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800"><div className="h-full w-[52%] rounded-full bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500" /></div>
          <p className="mt-2 text-xs text-zinc-400">Fundação estrutural: 52%</p>
        </div>

        <nav className="space-y-7" aria-label="Navegação principal">
          {sections.map((section) => (
            <section key={section.title}>
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{section.title}</p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link key={item.href} href={item.href} className={`block rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-300 hover:bg-zinc-900 hover:text-white"}`}>
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-zinc-800 bg-zinc-950/95 p-2 backdrop-blur lg:hidden">
        {sections[0].items.slice(0, 4).map((item) => {
          const active = isActive(pathname, item.href);
          return <Link key={item.href} href={item.href} className={`rounded-lg px-2 py-2 text-center text-xs ${active ? "bg-white text-zinc-950" : "text-zinc-400"}`}>{item.name}</Link>;
        })}
      </nav>
    </>
  );
}
