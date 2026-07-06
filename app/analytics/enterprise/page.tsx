import { AnalyticsEngine } from "@/lib/analytics/engine";
import { forecastRevenue } from "@/lib/analytics/calculator";

export default function EnterpriseAnalytics() {
  const leads = 1200;
  const deals = 180;

  const conversion = AnalyticsEngine.calculateConversion(leads, deals);

  const forecast = forecastRevenue([
    { value: 500000, probability: 70 },
    { value: 800000, probability: 40 },
  ]);

  return (
    <div style={{ padding: 24 }}>
      <h1>🚀 Executive Analytics</h1>

      <div>
        <h2>Conversão</h2>
        <p>{conversion.toFixed(2)}%</p>

        <h2>Receita Prevista</h2>
        <p>R$ {forecast.expectedRevenue.toFixed(2)}</p>

        <h2>Confiança IA</h2>
        <p>{forecast.confidence.toFixed(2)}%</p>
      </div>
    </div>
  );
}
