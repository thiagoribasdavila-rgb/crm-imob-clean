"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Dashboard() {
  const [leads, setLeads] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("leads").select("*");
      setLeads(data || []);
    }

    load();
  }, []);

  const novos = leads.filter((l) => l.status === "novo").length;
  const contato = leads.filter((l) => l.status === "contato").length;
  const ganho = leads.filter((l) => l.status === "ganho").length;

  return (
    <div style={{ padding: 20 }}>
      <h1>Dashboard CRM</h1>

      <p>Novos: {novos}</p>
      <p>Contato: {contato}</p>
      <p>Ganho: {ganho}</p>
      <p>Total: {leads.length}</p>
    </div>
  );
}
