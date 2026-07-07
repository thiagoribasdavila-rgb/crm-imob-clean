export default function AnalyticsPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">
          CRM Analytics
        </h1>

        <p className="text-gray-400 mt-2">
          Inteligência comercial e performance imobiliária
        </p>
      </div>


      <section className="grid grid-cols-1 md:grid-cols-4 gap-6">

        <Card 
          title="Leads Totais"
          value="15.420"
        />

        <Card
          title="Leads Qualificados"
          value="3.280"
        />

        <Card
          title="Visitas"
          value="486"
        />

        <Card
          title="Vendas"
          value="42"
        />

      </section>


      <section className="mt-10 grid md:grid-cols-2 gap-6">


        <div className="bg-gray-900 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">
            Funil Comercial
          </h2>

          <ul className="space-y-3 text-gray-300">

            <li>
              Leads → 15.420
            </li>

            <li>
              Contatos → 8.200
            </li>

            <li>
              Qualificados → 3.280
            </li>

            <li>
              Visitas → 486
            </li>

            <li>
              Propostas → 120
            </li>

            <li>
              Vendas → 42
            </li>

          </ul>
        </div>



        <div className="bg-gray-900 rounded-xl p-6">

          <h2 className="text-xl font-semibold mb-4">
            Indicadores
          </h2>


          <div className="space-y-4 text-gray-300">

            <p>
              CPL Médio: R$ 42,50
            </p>

            <p>
              Conversão: 1,2%
            </p>

            <p>
              VGV: R$ 38 milhões
            </p>

            <p>
              ROI Marketing: 8,4x
            </p>

          </div>

        </div>


      </section>

    </main>
  );
}



function Card({
  title,
  value
}:{
  title:string;
  value:string;
}){

  return (

    <div className="bg-gray-900 rounded-xl p-6">

      <p className="text-gray-400 text-sm">
        {title}
      </p>


      <h3 className="text-3xl font-bold mt-3">
        {value}
      </h3>


    </div>

  )
}
