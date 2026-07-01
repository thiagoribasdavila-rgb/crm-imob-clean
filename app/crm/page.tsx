import Link from "next/link"
import { createSupabaseServer } from "@/lib/supabase/server"

export default async function CRMPage() {
  const supabase = createSupabaseServer()

  const { data: leads } = await supabase
    .from("leads")
    .select("*")

  const total = leads?.length || 0
  const novos = leads?.filter(l => l.status === "novo").length || 0
  const fechados = leads?.filter(l => l.status === "fechado").length || 0

  return (
    <div style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>📊 CRM Imobiliário</h1>

      <div style={{ display: "flex", gap: 20, marginTop: 20 }}>
        <div>📌 Total: {total}</div>
        <div>🆕 Novos: {novos}</div>
        <div>🏁 Fechados: {fechados}</div>
      </div>

      <hr style={{ margin: "20px 0" }} />

      <Link href="/crm/leads">Ver Leads</Link>
      <br />
      <Link href="/crm/leads/new">+ Novo Lead</Link>
    </div>
  )
}
