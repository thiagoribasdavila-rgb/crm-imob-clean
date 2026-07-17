import Link from "next/link";
export default function CampaignsPage() {
  return (
    <div className="space-y-4 p-6">
      <h1>Campanhas</h1>
      <p>Gestão de campanhas de tráfego</p>
      <Link className="inline-flex rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white" href="/marketing/campaign-intelligence">Abrir inteligência multicanal</Link>
    </div>
  );
}
