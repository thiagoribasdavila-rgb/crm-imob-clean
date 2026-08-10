export default function StatusBadge({ status }: { status: string }) {
  const color =
    status === "novo"
      ? "gray"
      : status === "contato"
      ? "blue"
      : status === "proposta"
      ? "orange"
      : "green"

  return (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: 8,
        background: color,
        color: "white",
        fontSize: 12,
      }}
    >
      {status}
    </span>
  )
}
