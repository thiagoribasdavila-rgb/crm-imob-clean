"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { useParams, useRouter } from "next/navigation"
import { Loading } from "@/components/core/Loading"

export default function EditLeadPage() {
  const { id } = useParams()
  const router = useRouter()

  const [lead, setLead] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!supabase) return

      const { data } = await supabase
        .from("leads")
        .select("*")
        .eq("id", id)
        .single()

      setLead(data)
      setLoading(false)
    }

    load()
  }, [id])

  async function updateLead() {
    if (!supabase) return

    await supabase
      .from("leads")
      .update({
        name: lead.name,
        status: lead.status,
      })
      .eq("id", id)

    router.push("/crm/leads")
  }

  if (loading) return <Loading />

  if (!lead) return <p>Lead não encontrado</p>

  return (
    <div style={{ padding: 40 }}>
      <h1>Editar Lead</h1>

      <input
        value={lead.name}
        onChange={(e) =>
          setLead({ ...lead, name: e.target.value })
        }
      />

      <input
        value={lead.status}
        onChange={(e) =>
          setLead({ ...lead, status: e.target.value })
        }
      />

      <button onClick={updateLead}>
        Salvar
      </button>
    </div>
  )
}
