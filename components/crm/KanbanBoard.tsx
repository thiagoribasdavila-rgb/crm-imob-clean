"use client"

import LeadCard from "./LeadCard"

const columns = ["novo", "contato", "proposta", "fechado"]

export default function KanbanBoard({ leads, refresh }: any) {
  return (
    <div style={{ display: "flex", gap: 20 }}>
      {columns.map((status) => (
        <div key={status} style={{ flex: 1 }}>
          <h3>{status.toUpperCase()}</h3>

          {leads
            .filter((l: any) => l.status === status)
            .map((lead: any) => (
              <LeadCard key={lead.id} lead={lead} refresh={refresh} />
            ))}
        </div>
      ))}
    </div>
  )
}
