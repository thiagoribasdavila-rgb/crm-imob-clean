"use client";

import { useState } from "react";

type PropertyFormData = {
  title: string;
  price: string;
  location: string;
  description?: string;
};

export default function PropertyForm({
  initialData,
  onSubmit,
}: {
  initialData?: PropertyFormData;
  onSubmit: (data: PropertyFormData) => void;
}) {
  const [form, setForm] = useState<PropertyFormData>({
    title: initialData?.title || "",
    price: initialData?.price || "",
    location: initialData?.location || "",
    description: initialData?.description || "",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input
        placeholder="Título do imóvel"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
      />

      <input
        placeholder="Preço"
        value={form.price}
        onChange={(e) => setForm({ ...form, price: e.target.value })}
      />

      <input
        placeholder="Localização"
        value={form.location}
        onChange={(e) => setForm({ ...form, location: e.target.value })}
      />

      <textarea
        placeholder="Descrição"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
      />

      <button onClick={() => onSubmit(form)}>Salvar imóvel</button>
    </div>
  );
}
