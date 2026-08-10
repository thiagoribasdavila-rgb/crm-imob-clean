type Props = {
  title?: string;
  data?: {
    label: string;
    value: number;
  }[];
};

export default function BarChart({
  title = "Performance",
  data,
}: Props) {
  const chartData = data || [
    { label: "Meta Ads", value: 45 },
    { label: "Google", value: 30 },
    { label: "Orgânico", value: 15 },
    { label: "Indicação", value: 10 },
  ];

  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <h3>{title}</h3>

      <div style={{ marginTop: 10 }}>
        {chartData.map((item, index) => (
          <div key={index} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12 }}>{item.label}</div>

            <div
              style={{
                height: 10,
                width: `${item.value * 2}px`,
                background: "#000",
                borderRadius: 6,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
