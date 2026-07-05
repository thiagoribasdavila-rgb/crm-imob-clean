import { LeadService } from "@/services/lead.service";

export default async function Dashboard() {
  const service = new LeadService();
  const leads = await service.getLeads();

  return (
    <div>
      <h1>CRM Dashboard</h1>

      <p>Total leads: {leads?.length}</p>
    </div>
  );
}
