import Link from "next/link";

export default async function LeadsPage() {
  const res = await fetch("http://localhost:3000/api/leads", {
    cache: "no-store",
  });

  const leads = await res.json();

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h1>Leads</h1>

        <Link href="/leads/new">
          <button>Novo Lead</button>
        </Link>
      </div>

      <table width="100%" cellPadding={10}>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Telefone</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>

        <tbody>
          {leads.map((lead: any) => (
            <tr key={lead.id}>
              <td>{lead.name}</td>
              <td>{lead.phone}</td>
              <td>{lead.status}</td>
              <td>
                <Link href={`/leads/${lead.id}`}>Abrir</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
