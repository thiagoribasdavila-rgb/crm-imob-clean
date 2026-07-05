import { LeadService } from "@/lib/services/leads.services";

export default async function KanbanPage() {
  const service = new LeadService();
  const leads = await service.getLeads();

  return (
    <div>
      <h1>Kanban</h1>

      <div>
        {leads?.map((lead: any) => (
          <div key={lead.id}>
            {lead.name} - {lead.status}
          </div>
        ))}
      </div>
    </div>
  );
}
