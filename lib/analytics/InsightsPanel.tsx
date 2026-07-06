import { generateInsights } from "@/lib/analytics/insights";

export default function InsightsPanel() {
  const insights = generateInsights({
    conversion: 18,
    cac: 650,
    hotLeads: 80,
  });

  return (
    <div style={{ padding: 16 }}>
      <h2>🧠 AI Insights</h2>

      {insights.map((i, idx) => (
        <p key={idx}>{i}</p>
      ))}
    </div>
  );
}
