// app/(crm)/layout.tsx
import "../globals.css"

export default function CRMLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="h-screen flex bg-gray-50">

      {/* SIDEBAR FIXA */}
      <aside className="w-64 bg-white border-r p-4">
        <div className="font-bold text-xl mb-6">
          CRM Imobiliário
        </div>

        <nav className="space-y-2 text-sm">
          <a href="/(crm)" className="block">Dashboard</a>
          <a href="/(crm)/leads" className="block">Leads</a>
          <a href="/(crm)/clientes" className="block">Clientes</a>
          <a href="/(crm)/imoveis" className="block">Imóveis</a>
        </nav>
      </aside>

      {/* CONTEÚDO */}
      <main className="flex-1 overflow-auto p-6">
        {children}
      </main>

    </div>
  )
}
