import { LeadService } from "@/lib/services/leads.services";

export default async function LeadsTablePage() {
  const service = new LeadService();
  const leads = await service.getLeads();

  return (
    <div>
      <h1>Tabela de Leads</h1>

      <table>
        <tbody>
          {leads?.map((lead: any) => (
            <tr key={lead.id}>
              <td>{lead.name}</td>
              <td>{lead.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
