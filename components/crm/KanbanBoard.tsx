"use client"

import KanbanColumn from "./KanbanColumn"

const columns = ["novo", "contato", "proposta", "fechado"]

export default function KanbanBoard({ leads, onMove }: any) {
  return (
    <div style={{ display: "flex", gap: 20 }}>
      {columns.map((status) => (
        <KanbanColumn
          key={status}
          status={status}
          leads={leads.filter((l: any) => l.status === status)}
          onMove={onMove}
        />
      ))}
    </div>
  )
}
