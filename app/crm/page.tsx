"use client";

import { useRouter } from "next/navigation";

export default function CRMPage() {
  const router = useRouter();

  return (
    <div style={{ padding: 20 }}>
      <h1>CRM Imobiliário</h1>

      <ul>
        <li onClick={() => router.push("/crm/leads")}>
          Leads
        </li>

        <li onClick={() => router.push("/crm/leads/new")}>
          Novo Lead
        </li>
      </ul>
    </div>
  );
}
