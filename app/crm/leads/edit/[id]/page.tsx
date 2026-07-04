"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useParams, useRouter } from "next/navigation";

export default function EditLeadPage() {
  const { id } = useParams();
  const router = useRouter();

  const [lead, setLead] = useState<any>(null);

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

  async function save() {
    await supabase
      .from("leads")
      .update({ name: lead.name })
      .eq("id", id);

    router.push("/crm/leads");
  }

  if (!lead) return <p>Carregando...</p>;

  return (
    <div style={{ padding: 20 }}>
      <h1>Editar Lead</h1>

      <input
        value={lead.name}
        onChange={(e) =>
          setLead({ ...lead, name: e.target.value })
        }
      />

      <button onClick={save}>
        Salvar
      </button>
    </div>
  );
}
