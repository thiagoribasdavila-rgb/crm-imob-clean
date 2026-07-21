export default async function TaskDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <h1>Tarefa {id}</h1>
    </div>
  );
}
