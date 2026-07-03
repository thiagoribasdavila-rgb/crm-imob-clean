"use client"

import { ReactNode } from "react"
import { SupabaseGuard } from "@/components/SupabaseGuard"

export default function AppProviders({
  children,
}: {
  children: ReactNode
}) {
  return (
    <SupabaseGuard>
      {children}
    </SupabaseGuard>
  )
}
