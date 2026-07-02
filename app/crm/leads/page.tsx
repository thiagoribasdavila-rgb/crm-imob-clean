"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Lead } from "@/types/lead";
import Link from "next/link";

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("leads").select("*");
      setLeads(data || []);
    }

    load();
  }, []);

  return (
    <div>
      <h1>Leads</h1>

      <Link href="/crm/leads/new">Novo Lead</Link>

      {leads.map((lead) => (
        <div key={lead.id}>
          {lead.name} - {lead.status}

          <Link href={`/crm/leads/edit/${lead.id}`}>
            Editar
          </Link>
        </div>
      ))}
    </div>
  );
}
