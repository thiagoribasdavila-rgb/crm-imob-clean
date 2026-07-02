import Link from "next/link"
import { supabase } from "@/lib/supabase/client"

export default async function LeadsPage() {
  const { data } = await supabase.from("leads").select("*")

  return (
    <div>
      <h1>Leads</h1>

      <Link href="/crm/leads/new">+ Novo Lead</Link>

      <ul>
        {data?.map((lead: any) => (
          <li key={lead.id}>
            {lead.name} - {lead.status}{" "}
            <Link href={`/crm/leads/edit/${lead.id}`}>editar</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
