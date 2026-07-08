import Link from "next/link";

const modules = [
  {
    title: "Leads Analytics",
    description: "Análise completa dos leads, origem, qualidade e conversão.",
    href: "/crm/analytics/leads",
    icon: "👥",
  },
  {
    title: "Funnel Analytics",
    description: "Visualização do funil comercial e taxas de conversão.",
    href: "/crm/analytics/funnel",
    icon: "📊",
  },
  {
    title: "Sales Analytics",
    description: "Performance comercial, vendas e VGV.",
    href: "/crm/analytics/sales",
    icon: "💰",
  },
  {
    title: "Marketing Analytics",
    description: "Campanhas, CPL, ROI e canais de aquisição.",
    href: "/crm/analytics/marketing",
    icon: "🚀",
  },
  {
    title: "Source Analytics",
    description: "Origem dos clientes e melhores fontes de leads.",
    href: "/crm/analytics/source",
    icon: "🎯",
  },
  {
    title: "Realtime Analytics",
    description: "Dados em tempo real da operação comercial.",
    href: "/crm/analytics/realtime",
    icon: "⚡",
  },
  {
    title: "Performance Analytics",
    description: "Indicadores dos corretores e equipe.",
    href: "/crm/analytics/performance",
    icon: "🏆",
  },
  {
    title: "Enterprise Analytics",
    description: "Visão estratégica para incorporadoras e gestores.",
    href: "/crm/analytics/enterprise",
    icon: "🏢",
  },
  {
    title: "Conversion Analytics",
    description: "Conversão por etapa do processo comercial.",
    href: "/crm/analytics/conversion",
    icon: "📈",
  },
];

export default function AnalyticsPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">

      <header className="mb-10">
        <h1 className="text-4xl font-bold">
          CRM Analytics
        </h1>

        <p className="text-slate-400 mt-2">
          Inteligência comercial do Atlas AI Real Estate CRM
        </p>
      </header>


      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {modules.map((item)=>(
          <Link
            key={item.title}
            href={item.href}
            className="
            rounded-2xl
            border
            border-slate-800
            bg-slate-900
            p-6
            hover:border-blue-500
            transition
            "
          >

            <div className="text-4xl mb-4">
              {item.icon}
            </div>

            <h2 className="text-xl font-semibold">
              {item.title}
            </h2>

            <p className="text-slate-400 mt-3">
              {item.description}
            </p>

          </Link>
        ))}

      </section>

    </main>
  );
}
