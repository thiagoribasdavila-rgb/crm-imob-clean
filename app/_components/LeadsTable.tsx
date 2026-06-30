import React from "react";

type Lead = {
  id: number;
  name: string;
  email: string;
  status: "Novo" | "Contato" | "Negociando" | "Fechado";
  source: string;
  createdAt: string;
};

type LeadsTableProps = {
  leads: Lead[];
};

function getStatusColor(status: Lead["status"]) {
  switch (status) {
    case "Novo":
      return "bg-blue-100 text-blue-700";
    case "Contato":
      return "bg-yellow-100 text-yellow-700";
    case "Negociando":
      return "bg-orange-100 text-orange-700";
    case "Fechado":
      return "bg-green-100 text-green-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

export function LeadsTable({ leads }: LeadsTableProps) {
  return (
    <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
      
      {/* Header */}
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold text-gray-800">
          Leads
        </h2>
      </div>

      {/* Table */}
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-gray-500">
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

              {/* Status */}
              <td className="p-3">
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(
                    lead.status
                  )}`}
                >
                  {lead.status}
                </span>
              </td>

              <td className="p-3 text-gray-600">{lead.source}</td>
              <td className="p-3 text-gray-600">
                {lead.createdAt}
              </td>

              <td className="p-3">
                <button className="text-blue-600 text-xs hover:underline">
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
