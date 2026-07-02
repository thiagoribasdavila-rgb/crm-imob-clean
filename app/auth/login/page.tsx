"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

export default function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const router = useRouter()

  async function login() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (!error) router.push("/dashboard")
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Login Empresa</h1>

      <input placeholder="email" onChange={(e) => setEmail(e.target.value)} />
      <input placeholder="senha" type="password" onChange={(e) => setPassword(e.target.value)} />

      <button onClick={login}>Entrar</button>
    </div>
  )
}
