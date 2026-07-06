export default function KanbanPage() {
  return (
    <div style={{ padding: 24 }}>
      <h1>Kanban de Leads</h1>

      <div style={{ display: "flex", gap: 16 }}>
        <div>
          <h3>Novos</h3>
        </div>

        <div>
          <h3>Contato</h3>
        </div>

        <div>
          <h3>Proposta</h3>
        </div>

        <div>
          <h3>Fechado</h3>
        </div>
      </div>
    </div>
  );
}
