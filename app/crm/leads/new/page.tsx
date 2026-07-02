"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function NewLead() {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("novo");
  const router = useRouter();

  async function handleSubmit() {
    await supabase.from("leads").insert({
      name,
      status,
    });

    router.push("/crm/leads");
  }

  return (
    <div>
      <h1>Novo Lead</h1>

      <input
        placeholder="Nome"
        onChange={(e) => setName(e.target.value)}
      />

      <input
        placeholder="Status"
        onChange={(e) => setStatus(e.target.value)}
      />

      <button onClick={handleSubmit}>
        Salvar
      </button>
    </div>
  );
}
