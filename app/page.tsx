import Link from "next/link";

export default function Home() {
  return (
    <div style={{ padding: 24 }}>
      <h1>CRM Imobiliário</h1>

      <Link href="/crm/leads">
        Ir para Leads
      </Link>
    </div>
  );
}
