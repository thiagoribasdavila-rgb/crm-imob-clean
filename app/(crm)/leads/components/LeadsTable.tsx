type Lead = {
  id: number;
  name: string;
  email: string;
  status: "Novo" | "Contato" | "Negociando" | "Fechado";
  source: string;
  createdAt: string;
};

const mockLeads: Lead[] = [
  {
    id: 1,
    name: "João Silva",
    email: "joao@email.com",
    status: "Novo",
    source: "Meta Ads",
    createdAt: "2026-06-29",
  },
  {
    id: 2,
    name: "Maria Santos",
    email: "maria@email.com",
    status: "Negociando",
    source: "Site",
    createdAt: "2026-06-28",
  },
  {
    id: 3,
    name: "Carlos Lima",
    email: "carlos@email.com",
    status: "Contato",
    source: "WhatsApp",
    createdAt: "2026-06-27",
  },
];

function getStatusColor(status: Lead["status"]) {
  switch (status) {
    case "Novo":
      return "bg-blue-100 text-blue-600";
    case "Contato":
      return "bg-yellow-100 text-yellow-700";
    case "Negociando":
      return "bg-orange-100 text-orange-700";
    case "Fechado":
      return "bg-green-100 text-green-700";
  }
}

export default function LeadsTable() {
  return (
    <div className="bg-white border rounded-xl shadow-sm overflow-hidden">

      {/* HEADER TABLE */}
      <div className="p-4 border-b">
        <h2 className="font-semibold">Lista de Leads</h2>
      </div>

      {/* TABLE */}
      <table className="w-full text-sm">
        <thead className="text-left text-gray-500 bg-gray-50">
          <tr>
            <th className="p-3">Nome</th>
            <th>Email</th>
            <th>Status</th>
            <th>Origem</th>
            <th>Data</th>
            <th>Ações</th>
          </tr>
        </thead>

        <tbody>
          {mockLeads.map((lead) => (
            <tr key={lead.id} className="border-t hover:bg-gray-50">

              <td className="p-3 font-medium">{lead.name}</td>
              <td>{lead.email}</td>

              <td>
                <span className={`px-2 py-1 rounded text-xs ${getStatusColor(lead.status)}`}>
                  {lead.status}
                </span>
              </td>

              <td>{lead.source}</td>
              <td>{lead.createdAt}</td>

              <td className="text-blue-600 text-xs cursor-pointer">
                Ver
              </td>

            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
