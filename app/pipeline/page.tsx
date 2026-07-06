import Link from "next/link";

export default function PipelinePage() {
  return (
    <div style={{ padding: 24 }}>
      <h1>Pipeline de Vendas</h1>

      <div style={{ display: "flex", gap: 12 }}>
        <Link href="/pipeline/board">Board</Link>
        <Link href="/pipeline/deals">Deals</Link>
        <Link href="/pipeline/stages">Stages</Link>
        <Link href="/pipeline/funnel">Funnel</Link>
        <Link href="/pipeline/history">History</Link>
      </div>
    </div>
  );
}
