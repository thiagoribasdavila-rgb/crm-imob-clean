export default function CrmLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div style={{ display: "flex" }}>
      <aside style={{ width: 200, padding: 20, borderRight: "1px solid #ddd" }}>
        <h3>CRM</h3>
        <nav>
          <a href="/crm/leads">Leads</a>
          <br />
          <a href="/crm/leads/new">Novo</a>
        </nav>
      </aside>

      <main style={{ padding: 20, flex: 1 }}>{children}</main>
    </div>
  )
}
