import Link from "next/link";

export default function AnalyticsPage() {
  return (
    <div style={{ padding: 24 }}>
      <h1>Analytics Dashboard</h1>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/analytics/leads">Leads</Link>
        <Link href="/analytics/sales">Vendas</Link>
        <Link href="/analytics/conversion">Conversão</Link>
        <Link href="/analytics/source">Origem</Link>
        <Link href="/analytics/brokers">Corretores</Link>
        <Link href="/analytics/funnel">Funil</Link>
      </div>
    </div>
  );
}
