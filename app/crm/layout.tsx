import Link from "next/link"

export default function CrmLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* SIDEBAR */}
      <aside
        style={{
          width: 240,
          borderRight: "1px solid #ddd",
          padding: 20,
        }}
      >
        <h2>CRM Imobiliário</h2>

        <nav style={{ marginTop: 20 }}>
          <ul style={{ listStyle: "none", padding: 0 }}>
            <li>
              <Link href="/crm/leads">📋 Leads</Link>
            </li>
            <li>
              <Link href="/crm/leads/new">➕ Novo Lead</Link>
            </li>
          </ul>
        </nav>
      </aside>

      {/* CONTEÚDO */}
      <main style={{ flex: 1, padding: 30 }}>{children}</main>
    </div>
  )
}
