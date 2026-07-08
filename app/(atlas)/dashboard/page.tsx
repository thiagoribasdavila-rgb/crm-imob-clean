export default function AtlasDashboard() {
  return (
    <main className="min-h-screen bg-black text-white p-10">

      <h1 className="text-4xl font-bold">
        ATLAS AI
      </h1>

      <p className="text-gray-400 mt-2">
        Real Estate Operating System
      </p>


      <section className="grid grid-cols-4 gap-6 mt-10">

        <Card 
          title="Leads"
          value="3.421"
          status="IA Monitorando"
        />

        <Card
          title="VGV Pipeline"
          value="R$ 42,8M"
          status="Em evolução"
        />

        <Card
          title="Conversão"
          value="8,4%"
          status="Otimização IA"
        />

        <Card
          title="Mercado"
          value="87%"
          status="Oportunidade"
        />

      </section>


      <section className="mt-10 grid grid-cols-2 gap-6">

        <div className="bg-zinc-900 rounded-xl p-6">
          <h2 className="text-xl font-semibold">
            Agentes Inteligentes Ativos
          </h2>

          <ul className="mt-5 space-y-3 text-gray-300">

            <li>🤖 Lead Agent - Online</li>
            <li>🤖 Marketing Agent - Online</li>
            <li>🤖 Sales Agent - Online</li>
            <li>🤖 Market Intelligence - Online</li>

          </ul>

        </div>


        <div className="bg-zinc-900 rounded-xl p-6">

          <h2 className="text-xl font-semibold">
            Recomendações da IA
          </h2>

          <p className="mt-5 text-gray-300">
            Analisando estoque, campanhas,
            leads e oportunidades de mercado.
          </p>

        </div>

      </section>


    </main>
  )
}


function Card({
 title,
 value,
 status
}:{
 title:string
 value:string
 status:string
}){

return (

<div className="bg-zinc-900 rounded-xl p-6">

<h3 className="text-gray-400">
{title}
</h3>

<div className="text-3xl font-bold mt-3">
{value}
</div>

<p className="text-green-400 mt-2">
{status}
</p>

</div>

)

}
