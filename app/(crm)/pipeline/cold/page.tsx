import { LeadService } from "@/lib/services/leads.services";

export default async function ColdLeads() {
  const service = new LeadService();
  const leads = await service.getLeads();

  const cold = leads?.filter((l: any) => l.score < 50);

  return (
    <div>
      <h1>Leads COLD</h1>

      {cold?.map((l: any) => (
        <div key={l.id}>{l.name}</div>
      ))}
    </div>
  );
}
