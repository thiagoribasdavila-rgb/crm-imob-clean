"use client";

import Link from "next/link";

const menu = [
  {
    title: "Operação",
    items: [
      { name: "Dashboard", href: "/crm/dashboard" },
      { name: "Leads", href: "/crm/leads" },
      { name: "Pipeline", href: "/crm/pipeline" },
      { name: "Clientes", href: "/crm/clients" },
    ],
  },
  {
    title: "Imobiliário",
    items: [
      { name: "Empreendimentos", href: "/crm/developments" },
      { name: "Imóveis", href: "/crm/properties" },
      { name: "Vendas", href: "/crm/sales" },
    ],
  },
  {
    title: "Gestão",
    items: [
      { name: "Marketing", href: "/crm/marketing" },
      { name: "Relatórios", href: "/crm/reports" },
      { name: "Integrações", href: "/crm/integrations" },
    ],
  },
  {
    title: "Inteligência",
    items: [
      { name: "Atlas AI", href: "/crm/ai" },
      { name: "Market Intelligence", href: "/crm/intelligence" },
    ],
  },
];

export default function Sidebar() {
  return (
    <aside className="w-72 min-h-screen bg-zinc-950 border-r border-zinc-800 p-6">

      <div className="mb-10">
        <h1 className="text-2xl font-bold text-white">
          ATLAS AI
        </h1>

        <p className="text-xs text-zinc-400">
          Real Estate Operating System
        </p>
      </div>


      <nav className="space-y-8">

        {menu.map((section)=>(
          <div key={section.title}>

            <p className="text-xs uppercase text-zinc-500 mb-3">
              {section.title}
            </p>


            <div className="space-y-2">

              {section.items.map(item=>(
                <Link
                  key={item.href}
                  href={item.href}
                  className="
                  block
                  rounded-xl
                  px-4
                  py-3
                  text-sm
                  text-zinc-300
                  hover:bg-zinc-800
                  hover:text-white
                  transition
                  "
                >
                  {item.name}
                </Link>
              ))}

            </div>

          </div>
        ))}

      </nav>

    </aside>
  );
}
