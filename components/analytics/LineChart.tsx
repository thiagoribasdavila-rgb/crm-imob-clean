type Props = {
  title?: string;
  data?: number[];
};

export default function LineChart({
  title = "Crescimento",
  data,
}: Props) {
  const chartData = data || [10, 20, 35, 50, 80, 120];

  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <h3>{title}</h3>

      <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
        {chartData.map((value, i) => (
          <div
            key={i}
            style={{
              height: value,
              width: 20,
              background: "#333",
              borderRadius: 4,
            }}
          />
        ))}
      </div>
    </div>
  );
}
