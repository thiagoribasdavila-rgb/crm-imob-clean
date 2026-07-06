"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });

      setLeads(data || []);
    }

    load();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>CRM - Leads</h1>

      <a href="/crm/leads/new">+ Novo Lead</a>

      <ul>
        {leads.map((lead) => (
          <li key={lead.id}>
            <strong>{lead.name}</strong> — {lead.status}
          </li>
        ))}
      </ul>
    </div>
  );
}
