type Match = {
  leadName: string;
  propertyTitle: string;
  score: number;
};

export default function PropertyMatchCard({
  match,
}: {
  match: Match;
}) {
  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        background: "#fff",
      }}
    >
      <h3>🤖 Match IA</h3>

      <p>
        <strong>Lead:</strong> {match.leadName}
      </p>

      <p>
        <strong>Imóvel:</strong> {match.propertyTitle}
      </p>

      <p>
        <strong>Score:</strong>{" "}
        <span style={{ fontWeight: "bold" }}>
          {match.score}%
        </span>
      </p>

      <button>Enviar proposta automática</button>
    </div>
  );
}
