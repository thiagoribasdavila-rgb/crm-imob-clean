"use client";

import { useEffect, useState } from "react";
import { LeadService } from "@/lib/services/leads.services";

export default function EditLead({ params }: any) {
  const service = new LeadService();
  const [lead, setLead] = useState<any>(null);

  useEffect(() => {
    service.getLeadById(params.id).then(setLead);
  }, []);

  return (
    <div>
      <h1>Editar Lead</h1>

      {lead && (
        <div>
          <input defaultValue={lead.name} />
        </div>
      )}
    </div>
  );
}
