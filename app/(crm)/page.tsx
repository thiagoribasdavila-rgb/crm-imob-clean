import StatCard from "./components/crm/StatCard";

export default function Dashboard() {
  return (
    <div className="p-6 bg-gray-50 min-h-screen">

      {/* HEADER */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          CRM Dashboard
        </h1>
        <p className="text-gray-500 text-sm">
          Visão geral de leads, vendas e performance
        </p>
      </div>

      {/* STATS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

        <StatCard
          title="Leads Totais"
          value={128}
          description="Todos os leads cadastrados"
          trend={12}
        />

        <StatCard
          title="Leads Hoje"
          value={14}
          description="Novos leads hoje"
          trend={8}
        />

        <StatCard
          title="Conversões"
          value={32}
          description="Leads convertidos"
          trend={-3}
        />

        <StatCard
          title="Taxa de Fechamento"
          value="24%"
          description="Média geral"
          trend={5}
        />
      </div>

      {/* GRID SECUNDÁRIO */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">

        {/* PIPELINE */}
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <h2 className="font-semibold mb-3">Pipeline de Vendas</h2>
          <p className="text-sm text-gray-500">
            Aqui vamos conectar Supabase depois
          </p>
        </div>

        {/* ATIVIDADE */}
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <h2 className="font-semibold mb-3">Atividade Recente</h2>
          <p className="text-sm text-gray-500">
            Logs de leads e interações
          </p>
        </div>

      </div>
    </div>
  );
}
