import { getSupabase } from "@/lib/supabase/client";

export default function CRMPage() {
  const supabase = getSupabase();

  if (!supabase) {
    return (
      <div style={{ padding: 20 }}>
        <h2>Inicializando CRM...</h2>
        <p>Env do Supabase não carregada ainda</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>CRM Principal</h1>

      <div style={{ marginTop: 20 }}>
        <h3>Leads</h3>
        <p>Sistema funcionando corretamente</p>
      </div>
    </div>
  );
}
