"use client"

import LeadCard from "./LeadCard"
import { supabase } from "@/lib/supabase/client"

export default function KanbanColumn({ status, leads, refresh }: any) {

  async function handleDrop(e: any) {
    const leadId = e.dataTransfer.getData("leadId")

    await supabase
      .from("leads")
      .update({ status })
      .eq("id", leadId)

    refresh()
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      style={{
        flex: 1,
        minHeight: 400,
        border: "1px solid #ddd",
        padding: 10
      }}
    >
      <h3>{status.toUpperCase()}</h3>

      {leads.map((lead: any) => (
        <LeadCard key={lead.id} lead={lead} refresh={refresh} />
      ))}
    </div>
  )
}
