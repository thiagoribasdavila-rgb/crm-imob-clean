export default function DealDetail({ params }: any) {
  return (
    <div style={{ padding: 24 }}>
      <h1>Deal #{params.id}</h1>

      <p>Detalhes da negociação</p>
    </div>
  );
}
