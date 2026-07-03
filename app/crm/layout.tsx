"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import AppProviders from "@/components/providers/AppProviders"

export default function CRMLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.push("/login")
      }
    })
  }, [])

  return (
    <AppProviders>
      <div style={{ padding: 20 }}>
        {children}
      </div>
    </AppProviders>
  )
}
