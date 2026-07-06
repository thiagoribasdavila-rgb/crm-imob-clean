export default async function LeadDetail({ params }: any) {
  const res = await fetch(`http://localhost:3000/api/leads/${params.id}`, {
    cache: "no-store",
  });

  const lead = await res.json();

  return (
    <div style={{ padding: 24 }}>
      <h1>{lead.name}</h1>

      <p>Telefone: {lead.phone}</p>
      <p>Email: {lead.email}</p>
      <p>Status: {lead.status}</p>

      <a href={`/leads/${lead.id}/edit`}>Editar</a>
    </div>
  );
}
