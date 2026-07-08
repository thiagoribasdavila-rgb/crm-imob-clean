export default function AtlasLayout({
children,
}: {
children: React.ReactNode
}) {

return (

<div className="min-h-screen bg-zinc-950 text-white flex">

<aside className="w-72 border-r border-zinc-800 p-6">

<h1 className="text-3xl font-bold">
ATLAS AI
</h1>

<p className="text-gray-400 mb-10">
Operating System
</p>


<nav className="space-y-5">

<div>🏠 Dashboard</div>

<div>👥 CRM</div>

<div>🏢 Empreendimentos</div>

<div>🤖 Inteligência IA</div>

<div>📊 Analytics</div>

<div>⚙ Configurações</div>


</nav>

</aside>


<section className="flex-1">

{children}

</section>


</div>

)

}
