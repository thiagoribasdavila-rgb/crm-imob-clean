import { LeadService } from "@/lib/services/leads.services";

export default async function DashboardPage() {
  const service = new LeadService();
  const leads = await service.getLeads();

  return (
    <div>
      <h1>CRM Dashboard</h1>
      <p>Total leads: {leads?.length}</p>
    </div>
  );
}
