"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div>
      <h1>Login CRM</h1>

      <input placeholder="email" onChange={(e) => setEmail(e.target.value)} />
      <input placeholder="senha" onChange={(e) => setPassword(e.target.value)} />

      <button>Entrar</button>
    </div>
  );
}
