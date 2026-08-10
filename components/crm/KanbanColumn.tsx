import type { Lead } from "@/domain";
import LeadCard from "./LeadCard";

interface KanbanColumnProps {
  status: string;
  leads: Lead[];
  refresh?: () => void;
}

export default function KanbanColumn({
  status,
  leads,
}: KanbanColumnProps) {
  return (
    <section className="min-h-[500px] min-w-72 rounded-xl bg-zinc-950 p-4">
      <h2 className="mb-5 font-bold capitalize">{status}</h2>

      <div className="space-y-4">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} />
        ))}
      </div>
    </section>
  );
}
