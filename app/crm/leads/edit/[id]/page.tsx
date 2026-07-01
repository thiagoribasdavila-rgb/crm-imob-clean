import { useEffect, useState } from "react"
import supabase from "@/lib/supabase"

type PageProps = {
  params: {
    id: string
  }
}

export default function EditLead({ params }: PageProps) {
  const [lead, setLead] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadLead() {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("id", params.id)
        .single()

      if (error) {
        console.error(error)
      }

      setLead(data)
      setLoading(false)
    }

    loadLead()
  }, [params.id])

  if (loading) return <p>Carregando...</p>
  if (!lead) return <p>Lead não encontrado</p>

  return (
    <div style={{ padding: 20 }}>
      <h1>Editar Lead</h1>

      <p><b>Nome:</b> {lead.name}</p>
      <p><b>Telefone:</b> {lead.phone}</p>
      <p><b>Status:</b> {lead.status}</p>
    </div>
  )
}
