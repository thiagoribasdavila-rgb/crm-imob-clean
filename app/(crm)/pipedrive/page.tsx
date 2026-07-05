import { LeadService } from "@/lib/services/leads.services";

export default async function PipelinePage() {
  const service = new LeadService();
  const leads = await service.getLeads();

  return (
    <div>
      <h1>Pipeline</h1>

      {leads?.map((lead: any) => (
        <div key={lead.id}>
          {lead.name} - {lead.status}
        </div>
      ))}
    </div>
  );
}
