// app/(crm)/page.tsx

import { StatCard } from "@/components/crm/StatCard"

export default function Dashboard() {
  return (
    <div className="space-y-6">

      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-semibold">
          Dashboard
        </h1>
        <p className="text-gray-500">
          Visão geral do seu CRM imobiliário
        </p>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        <StatCard title="Leads" value="0" />
        <StatCard title="Clientes" value="0" />
        <StatCard title="Imóveis" value="0" />

      </div>

    </div>
  )
}
