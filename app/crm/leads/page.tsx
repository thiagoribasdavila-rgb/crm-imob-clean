import { supabase } from "@/lib/supabase/client"
import Link from "next/link"

export default async function LeadsPage() {
  const { data, error } = await supabase.from("leads").select("*")

  if (error) {
    return <p>Erro ao carregar leads</p>
  }

  return (
    <div>
      <h1>Leads</h1>

      <table border={1} cellPadding={10}>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>

        <tbody>
          {data?.map((lead) => (
            <tr key={lead.id}>
              <td>{lead.name}</td>
              <td>{lead.status}</td>
              <td>
                <Link href={`/crm/leads/edit/${lead.id}`}>
                  Editar
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
