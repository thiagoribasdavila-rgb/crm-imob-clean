"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useParams, useRouter } from "next/navigation";

export default function EditLead() {
  const { id } = useParams();
  const router = useRouter();

  const [name, setName] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("leads")
        .select("*")
        .eq("id", id)
        .single();

      if (data) {
        setName(data.name);
        setStatus(data.status);
      }
    }

    load();
  }, [id]);

  async function update() {
    await supabase
      .from("leads")
      .update({ name, status })
      .eq("id", id);

    router.push("/crm/leads");
  }

  return (
    <div>
      <h1>Editar Lead</h1>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <input
        value={status}
        onChange={(e) => setStatus(e.target.value)}
      />

      <button onClick={update}>
        Atualizar
      </button>
    </div>
  );
}
