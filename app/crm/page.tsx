import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";

export default function CRMPage() {
  const supabase = getSupabase();

  // 🔥 Proteção contra ENV quebrado
  if (!supabase) {
    return (
      <div style={{ padding: 20 }}>
        <h1>CRM inicializando...</h1>
        <p>Variáveis de ambiente não carregadas</p>
      </div>
    );
  }

  // 🔥 Aqui futuramente vamos validar sessão
  // const { data } = await supabase.auth.getUser()

  return (
    <div style={{ padding: 20 }}>
      <h1>CRM Dashboard</h1>

      <div style={{ marginTop: 20 }}>
        <h2>Leads</h2>
        <p>Sistema carregando corretamente</p>
      </div>
    </div>
  );
}
