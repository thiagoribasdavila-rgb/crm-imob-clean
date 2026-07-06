export default function NewLeadPage() {
  return (
    <div style={{ padding: 24 }}>
      <h1>➕ Novo Lead</h1>

      <input placeholder="Nome" />
      <input placeholder="Telefone" />
      <input placeholder="Interesse" />

      <button>Criar Lead</button>
    </div>
  );
}
