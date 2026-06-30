import Link from "next/link"

export default function Home() {
  return (
    <main style={{ padding: 40 }}>
      <h1>CRM Imobiliário</h1>

      <ul>
        <li><Link href="/crm/leads">Leads</Link></li>
        <li><Link href="/crm/leads/new">Novo Lead</Link></li>
      </ul>
    </main>
  )
}
