type Props = {
  data?: {
    stage: string;
    value: number;
  }[];
};

export default function FunnelChart({ data }: Props) {
  const defaultData = data || [
    { stage: "Leads", value: 1200 },
    { stage: "Contato", value: 800 },
    { stage: "Visita", value: 420 },
    { stage: "Proposta", value: 180 },
    { stage: "Venda", value: 52 },
  ];

  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <h3>Funil de Conversão</h3>

      <div style={{ marginTop: 10 }}>
        {defaultData.map((item, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "6px 0",
              borderBottom: "1px solid #f2f2f2",
            }}
          >
            <span>{item.stage}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
