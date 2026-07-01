import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = {
  params: {
    id: string;
  };
};

export default async function EditLead({ params }: Props) {
  const { id } = params;

  const { data: lead, error } = await supabaseServer
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Erro Supabase:", error);
  }

  if (!lead) {
    return <div>Lead não encontrado</div>;
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Editar Lead</h1>

      <div style={{ marginTop: 20 }}>
        <p><b>Nome:</b> {lead.name}</p>
        <p><b>Email:</b> {lead.email}</p>
        <p><b>Status:</b> {lead.status}</p>
      </div>
    </div>
  );
}
