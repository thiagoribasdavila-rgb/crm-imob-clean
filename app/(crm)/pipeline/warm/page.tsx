import { LeadService } from "@/lib/services/leads.services";

export default async function WarmLeads() {
  const service = new LeadService();
  const leads = await service.getLeads();

  const warm = leads?.filter((l: any) => l.score >= 50 && l.score < 80);

  return (
    <div>
      <h1>Leads WARM</h1>

      {warm?.map((l: any) => (
        <div key={l.id}>{l.name}</div>
      ))}
    </div>
  );
}
