import { LeadService } from "@/lib/services/leads.services";

export default async function HotLeads() {
  const service = new LeadService();
  const leads = await service.getLeads();

  const hot = leads?.filter((l: any) => l.score >= 80);

  return (
    <div>
      <h1>Leads HOT</h1>

      {hot?.map((l: any) => (
        <div key={l.id}>{l.name}</div>
      ))}
    </div>
  );
}
