import { LeadService } from "@/lib/services/leads.services";

export default async function AnalyticsPage() {
  const service = new LeadService();
  const leads = await service.getLeads();

  const hot = leads?.filter((l: any) => l.score > 80).length;

  return (
    <div>
      <h1>Analytics</h1>
      <p>Hot Leads: {hot}</p>
    </div>
  );
}
