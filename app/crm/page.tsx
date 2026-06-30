import supabase from "@/lib/supabase"

export default async function Dashboard() {
  const { data: leads } = await supabase
    .from("leads")
    .select("*")

  const total = leads?.length || 0

  return (
    <div style={{ padding: 20 }}>
      <h1>Dashboard CRM</h1>

      <div style={{
        padding: 20,
        background: "#f5f5f5",
        borderRadius: 10,
        marginTop: 20
      }}>
        <h2>Total de Leads: {total}</h2>
      </div>
    </div>
  )
}
