"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function NewLead() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    status: "novo",
  });

  async function handleSubmit() {
    await supabase.from("leads").insert([form]);
    alert("Lead criado!");
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Novo Lead</h1>

      <input
        placeholder="Nome"
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <br />

      <input
        placeholder="Email"
        onChange={(e) => setForm({ ...form, email: e.target.value })}
      />
      <br />

      <input
        placeholder="Telefone"
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
      />
      <br />

      <button onClick={handleSubmit}>Salvar</button>
    </div>
  );
}
