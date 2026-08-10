export default function MetricCard({
  title,
  value,
  trend,
}: any) {
  return (
    <div
      style={{
        padding: 16,
        border: "1px solid #ddd",
        borderRadius: 12,
        minWidth: 200,
      }}
    >
      <h4>{title}</h4>
      <h2>{value}</h2>
      <p>{trend > 0 ? "📈" : "📉"} {trend}%</p>
    </div>
  );
}
