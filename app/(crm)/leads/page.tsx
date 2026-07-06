export default function LeadsPage() {
  const leads = [
    { name: "João Silva", status: "Hot", value: "R$ 650k" },
    { name: "Maria Souza", status: "Warm", value: "R$ 420k" },
    { name: "Carlos Lima", status: "Cold", value: "R$ 300k" },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h1>📋 Leads CRM</h1>

      {leads.map((lead, idx) => (
        <div key={idx} style={{ marginBottom: 12 }}>
          <h3>{lead.name}</h3>
          <p>Status: {lead.status}</p>
          <p>Valor: {lead.value}</p>
        </div>
      ))}
    </div>
  );
}
