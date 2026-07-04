"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const router = useRouter();

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("leads").select("*");
      setLeads(data || []);
    }

    load();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>Leads</h1>

      <button onClick={() => router.push("/crm/leads/new")}>
        Novo Lead
      </button>

      {leads.map((lead) => (
        <div key={lead.id}>
          {lead.name} - {lead.status}
        </div>
      ))}
    </div>
  );
}
