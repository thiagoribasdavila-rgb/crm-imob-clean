export default function CRMLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex" }}>
      <aside style={{ width: 200, padding: 20 }}>
        <h3>CRM</h3>
        <ul>
          <li>Dashboard</li>
          <li>Leads</li>
          <li>Config</li>
        </ul>
      </aside>

      <main style={{ flex: 1 }}>{children}</main>
    </div>
  );
}
