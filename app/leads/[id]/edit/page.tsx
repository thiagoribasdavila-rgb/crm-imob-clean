"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function EditLead({ params }: any) {
  const router = useRouter();

  const [form, setForm] = useState<any>({});

  useEffect(() => {
    fetch(`/api/leads/${params.id}`)
      .then((r) => r.json())
      .then(setForm);
  }, []);

  async function save() {
    await fetch(`/api/leads/${params.id}`, {
      method: "PUT",
      body: JSON.stringify(form),
    });

    router.push("/leads");
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Editar Lead</h1>

      <input
        value={form.name || ""}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />

      <input
        value={form.phone || ""}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
      />

      <button onClick={save}>Salvar</button>
    </div>
  );
}
