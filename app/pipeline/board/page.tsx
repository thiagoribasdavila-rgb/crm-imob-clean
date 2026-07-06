export default function PipelineBoard() {
  return (
    <div style={{ padding: 24 }}>
      <h1>Kanban Pipeline</h1>

      <div style={{ display: "flex", gap: 16 }}>
        <div>
          <h3>Lead</h3>
        </div>

        <div>
          <h3>Contato</h3>
        </div>

        <div>
          <h3>Proposta</h3>
        </div>

        <div>
          <h3>Fechamento</h3>
        </div>
      </div>
    </div>
  );
}
