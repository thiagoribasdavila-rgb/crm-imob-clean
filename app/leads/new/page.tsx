"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewLeadPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    status: "NEW",
  });

  async function handleSubmit() {
    await fetch("/api/leads", {
      method: "POST",
      body: JSON.stringify(form),
    });

    router.push("/leads");
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Novo Lead</h1>

      <input
        placeholder="Nome"
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />

      <input
        placeholder="Telefone"
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
      />

      <input
        placeholder="Email"
        onChange={(e) => setForm({ ...form, email: e.target.value })}
      />

      <button onClick={handleSubmit}>Salvar</button>
    </div>
  );
}
