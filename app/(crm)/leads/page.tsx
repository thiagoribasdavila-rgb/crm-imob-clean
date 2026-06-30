import LeadsTable from "./components/LeadsTable";

export default function LeadsPage() {
  return (
    <div className="p-6 bg-gray-50 min-h-screen">

      {/* HEADER */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Leads</h1>
        <p className="text-gray-500 text-sm">
          Gerencie todos os seus leads em um só lugar
        </p>
      </div>

      <LeadsTable />
    </div>
  );
}
