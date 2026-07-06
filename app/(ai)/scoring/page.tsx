export default function AIScoringPage() {
  const leads = [
    { name: "João", score: 92 },
    { name: "Maria", score: 74 },
    { name: "Carlos", score: 38 },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h1>🎯 Lead Scoring IA</h1>

      {leads.map((l, i) => (
        <p key={i}>
          {l.name} — Score: {l.score}
        </p>
      ))}
    </div>
  );
}
