"use client"

import LeadCard from "./LeadCard"

export default function KanbanColumn({
  status,
  leads,
  onMove,
}: any) {
  return (
    <div
      style={{
        flex: 1,
        border: "1px solid #ddd",
        padding: 10,
        minHeight: 400,
      }}
    >
      <h3>{status.toUpperCase()}</h3>

      {leads.map((lead: any) => (
        <LeadCard
          key={lead.id}
          lead={lead}
          onMove={onMove}
        />
      ))}
    </div>
  )
}
