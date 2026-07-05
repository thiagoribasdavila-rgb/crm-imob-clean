import { LeadService } from "@/lib/services/leads.services";

export default async function PipelineStage({ params }: any) {
  const service = new LeadService();
  const leads = await service.getLeads();

  const filtered = leads?.filter((l: any) => l.status === params.stage);

  return (
    <div>
      <h1>Pipeline: {params.stage}</h1>

      {filtered?.map((lead: any) => (
        <div key={lead.id}>
          {lead.name}
        </div>
      ))}
    </div>
  );
}
