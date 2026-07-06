"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Lead = {
  id: string;
  name: string;
  status: string;
  created_at: string;
};

export default function CRMPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadLeads() {
      try {
        setLoading(true);

        const { data, error } = await supabase
          .from("leads")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;

        setLeads(data || []);
      } catch (err: any) {
        setError(err.message || "Erro ao carregar leads");
      } finally {
        setLoading(false);
      }
    }

    loadLeads();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <h2>Carregando CRM...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 20, color: "red" }}>
        <h2>Erro</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>CRM Imobiliário</h1>

      <div style={{ marginTop: 20 }}>
        <a href="/crm/new">+ Novo Lead</a>
      </div>

      <hr style={{ margin: "20px 0" }} />

      {leads.length === 0 ? (
        <p>Nenhum lead encontrado</p>
      ) : (
        <ul>
          {leads.map((lead) => (
            <li key={lead.id} style={{ marginBottom: 10 }}>
              <strong>{lead.name}</strong>
              <br />
              Status: {lead.status}
              <br />
              Criado em: {new Date(lead.created_at).toLocaleString()}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
