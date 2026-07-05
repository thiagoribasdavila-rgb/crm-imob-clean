"use client";

import { useState } from "react";
import { LeadService } from "@/lib/services/leads.services";

export default function NewLeadPage() {
  const service = new LeadService();
  const [name, setName] = useState("");

  async function handleCreate() {
    await service.createLead({ name });
  }

  return (
    <div>
      <h1>Novo Lead</h1>

      <input onChange={(e) => setName(e.target.value)} />
      <button onClick={handleCreate}>Criar</button>
    </div>
  );
}
