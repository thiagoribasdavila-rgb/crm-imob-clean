"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { getSupabase } from "@/lib/supabase/client"

export default function Page() {
  const params = useParams()
  const [lead, setLead] = useState<any>(null)

  useEffect(() => {
    const supabase = getSupabase()

    async function load() {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("id", params.id)
        .single()

      if (error) {
        console.error(error)
        return
      }

      setLead(data)
    }

    if (params?.id) {
      load()
    }
  }, [params?.id])

  return (
    <div>
      <h1>Editar Lead</h1>
      <pre>{JSON.stringify(lead, null, 2)}</pre>
    </div>
  )
}
