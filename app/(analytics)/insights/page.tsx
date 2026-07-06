export default function InsightsPage() {
  const insights = [
    "🔥 Leads quentes acima da média hoje",
    "📉 CAC em tendência de queda",
    "📈 Conversão aumentando no funil",
    "⚡ Tempo de resposta melhorando",
  ];

  return (
    <div style={{ padding: 24 }}>
      <h1>🧠 AI Insights</h1>

      {insights.map((i, idx) => (
        <p key={idx}>• {i}</p>
      ))}
    </div>
  );
}
