export default function LeadDetailPage() {
  const lead = {
    name: "João Silva",
    phone: "11999999999",
    status: "Hot",
    interest: "Apartamento Perdizes",
    score: 92,
  };

  return (
    <div style={{ padding: 24 }}>
      <h1>👤 Lead Detalhe</h1>

      <h2>{lead.name}</h2>

      <p>📞 {lead.phone}</p>
      <p>🔥 Status: {lead.status}</p>
      <p>🏠 Interesse: {lead.interest}</p>
      <p>🧠 Score IA: {lead.score}</p>
    </div>
  );
}
