import { CRM_HEAD } from "@/app/(core)/head/crm-head";

function generateInsights() {
  return [
    "🔥 Leads quentes acima da média",
    "⚠ CAC elevado em campanhas Meta",
    "📈 Pipeline saudável em crescimento",
  ];
}

export default function InsightsPage() {
  const insights = generateInsights();

  return (
    <div style={{ padding: 20 }}>
      <h1>🧠 AI Insights</h1>

      <p>Status do sistema: {CRM_HEAD.ai.enabled ? "ATIVO" : "OFF"}</p>

      <div style={{ marginTop: 20 }}>
        {insights.map((item, idx) => (
          <p key={idx}>• {item}</p>
        ))}
      </div>
    </div>
  );
}
