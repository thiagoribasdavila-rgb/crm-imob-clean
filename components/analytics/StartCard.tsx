export default function StatCard({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 12,
        padding: 16,
        width: 200,
      }}
    >
      <h4>{title}</h4>
      <h2>{value}</h2>
    </div>
  );
}
