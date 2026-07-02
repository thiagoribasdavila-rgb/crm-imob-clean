"use client"

import { useEffect } from "react"
import { getSupabase } from "@/lib/supabase/client"

export default function Page({ params }) {
  useEffect(() => {
    const supabase = getSupabase()

    async function load() {
      const { data } = await supabase
        .from("leads")
        .select("*")
        .eq("id", params.id)

      console.log(data)
    }

    load()
  }, [])

  return <div>Lead</div>
}
