import { LeadsService } from "@/lib/services/leads.service";

export default async function LeadsPage() {
  const leads = await LeadsService.list();

  return (
    <div>
      <h1>Leads</h1>

      {leads?.map((lead) => (
        <div key={lead.id}>
          {lead.name}
        </div>
      ))}
    </div>
  );
}
