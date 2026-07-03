"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  async function login() {
    if (!supabase) return

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (!error) {
      router.push("/crm")
    } else {
      alert("Erro login")
    }
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Login CRM</h1>

      <input
        placeholder="email"
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        placeholder="senha"
        type="password"
        onChange={(e) => setPassword(e.target.value)}
      />

      <button onClick={login}>
        Entrar
      </button>
    </div>
  )
}
