import { LeadService } from "@/lib/services/leads.services";

export default async function LeadDetail({ params }: any) {
  const service = new LeadService();
  const lead = await service.getLeadById(params.id);

  return (
    <div>
      <h1>{lead.name}</h1>
      <p>Status: {lead.status}</p>
      <p>Score: {lead.score}</p>
    </div>
  );
}
