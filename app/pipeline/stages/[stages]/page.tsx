export default function StagePage({ params }: any) {
  return (
    <div style={{ padding: 24 }}>
      <h1>Stage: {params.stage}</h1>

      <p>Leads dentro desta etapa</p>
    </div>
  );
}
