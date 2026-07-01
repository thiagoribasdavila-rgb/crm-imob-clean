import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

interface Props {
  params: { id: string };
}

export default async function EditLeadPage({ params }: Props) {
  const id = String(params.id);

  const { data: lead, error } = await supabaseServer
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !lead) {
    console.error("Lead not found:", error);
    return notFound();
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Editar Lead</h1>

      <div
        style={{
          marginTop: 20,
          padding: 20,
          background: "#f5f5f5",
          borderRadius: 10,
        }}
      >
        <p><b>Nome:</b> {lead.name}</p>
        <p><b>Email:</b> {lead.email}</p>
        <p><b>Status:</b> {lead.status}</p>
      </div>
    </div>
  );
}
