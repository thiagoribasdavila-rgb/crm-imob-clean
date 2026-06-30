import { useRouter } from "next/navigation";
import { useState } from "react";

export type LeadStatus = "new" | "contacted" | "won" | "lost";

export type Lead = {
  id: string;
  name: string;
  email: string;
  status: LeadStatus;
  source: string;
  createdAt: string;
};

type Props = {
  leads: Lead[];
  loading?: boolean;
};

const statusStyles: Record<LeadStatus, string> = {
  new: "bg-blue-100 text-blue-700",
  contacted: "bg-yellow-100 text-yellow-700",
  won: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-700",
};

export default function LeadsTable({ leads, loading }: Props) {
  const router = useRouter();

  if (loading) {
    return (
      <div className="p-6 text-gray-500 text-sm">Carregando leads...</div>
    );
  }

  if (!leads || leads.length === 0) {
    return (
      <div className="p-6 text-gray-500 text-sm">
        Nenhum lead encontrado.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-white rounded-xl shadow-sm border">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-600 text-left">
          <tr>
            <th className="p-3">Nome</th>
            <th className="p-3">Email</th>
            <th className="p-3">Status</th>
            <th className="p-3">Origem</th>
            <th className="p-3">Data</th>
            <th className="p-3">Ações</th>
          </tr>
        </thead>

        <tbody>
          {leads.map((lead) => (
            <tr
              key={lead.id}
              className="border-t hover:bg-gray-50 transition"
            >
              <td className="p-3 font-medium">{lead.name}</td>

              <td className="p-3 text-gray-600">{lead.email}</td>

              <td className="p-3">
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    statusStyles[lead.status]
                  }`}
                >
                  {lead.status}
                </span>
              </td>

              <td className="p-3 text-gray-600">{lead.source}</td>

              <td className="p-3 text-gray-500 text-xs">
                {new Date(lead.createdAt).toLocaleDateString("pt-BR")}
              </td>

              <td className="p-3">
                <button
                  onClick={() => router.push(`/crm/leads/${lead.id}`)}
                  className="text-blue-600 hover:underline text-sm"
                >
                  Ver
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
