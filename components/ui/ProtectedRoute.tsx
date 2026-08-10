"use client"

import { useEffect, type ReactNode } from "react"
import { supabase } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data }) => {
      if (active && !data.user) router.replace("/login")
    })
    return () => { active = false }
  }, [router])

  return children
}
