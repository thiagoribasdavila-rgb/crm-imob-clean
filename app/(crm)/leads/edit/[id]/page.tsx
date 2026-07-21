"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type LeadRow = { id: string; name: string | null; email: string | null; status: string | null };

export default function EditLead() {
  const { id } = useParams<{ id: string }>();
  const [lead, setLead] = useState<LeadRow | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("leads")
        .select("*")
        .eq("id", id)
        .single();

      setLead(data);
    }

    load();
  }, [id]);

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
