"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function EditLead({ params }: any) {
  const [lead, setLead] = useState<any>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("leads")
        .select("*")
        .eq("id", params.id)
        .single();

      setLead(data);
    }

    load();
  }, []);

  if (!lead) return <p>Carregando...</p>;

  return (
    <div style={{ padding: 20 }}>
      <h1>Editar Lead</h1>

      <p>{lead.name}</p>
      <p>{lead.email}</p>
      <p>{lead.status}</p>
    </div>
  );
}
