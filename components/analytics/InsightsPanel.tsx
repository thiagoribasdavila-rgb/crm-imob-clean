import { generateInsights } from "@/lib/analytics/insights";

export default function InsightsPanel() {
  const insights = generateInsights({
    leads: [
      { status: "hot", interactions: 5, source: "meta_ads", responseTime: 3, value: 500000 },
      { status: "cold", interactions: 1, source: "organic", responseTime: 120, value: 300000 },
    ],
  });

  return (
    <div style={{ padding: 20 }}>
      <h2>🧠 AI INSIGHTS VIVO</h2>

      {insights.map((i, idx) => (
        <div key={idx} style={{ margin: "8px 0" }}>
          {i}
        </div>
      ))}
    </div>
  );
}
