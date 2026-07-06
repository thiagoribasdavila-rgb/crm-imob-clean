"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewPropertyPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    title: "",
    price: "",
    location: "",
  });

  async function handleSubmit() {
    await fetch("/api/properties", {
      method: "POST",
      body: JSON.stringify(form),
    });

    router.push("/properties");
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Novo Imóvel</h1>

      <input
        placeholder="Título"
        onChange={(e) => setForm({ ...form, title: e.target.value })}
      />

      <input
        placeholder="Preço"
        onChange={(e) => setForm({ ...form, price: e.target.value })}
      />

      <input
        placeholder="Localização"
        onChange={(e) => setForm({ ...form, location: e.target.value })}
      />

      <button onClick={handleSubmit}>Salvar</button>
    </div>
  );
}
