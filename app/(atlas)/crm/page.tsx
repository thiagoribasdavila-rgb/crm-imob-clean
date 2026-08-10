import CRMHeader from "@/components/crm/CRMHeader";
import CRMStats from "@/components/crm/CRMStats";
import ExecutiveDashboard from "@/components/crm/ExecutiveDashboard";
import AIControlCenter from "@/components/crm/AIControlCenter";
import PipelineBoard from "@/components/crm/PipelineBoard";
import FollowUp from "@/components/crm/FollowUp";


export default function CRMPage() {

  return (

    <main className="min-h-screen bg-slate-950 text-white p-6 md:p-10">

      <div className="max-w-[1600px] mx-auto space-y-8">


        {/* HEADER */}

        <section>
          <CRMHeader />
        </section>



        {/* INDICADORES PRINCIPAIS */}

        <section>
          <CRMStats />
        </section>



        {/* DASHBOARD EXECUTIVO */}

        <section className="
          rounded-2xl 
          bg-slate-900 
          border 
          border-slate-800 
          p-6
        ">

          <ExecutiveDashboard />

        </section>



        {/* ÁREA CENTRAL */}

        <section className="
          grid 
          grid-cols-1 
          xl:grid-cols-3 
          gap-6
        ">


          {/* PIPELINE */}

          <div className="
            xl:col-span-2
            rounded-2xl
            bg-slate-900
            border
            border-slate-800
            p-6
          ">

            <div className="mb-5">

              <h2 className="text-xl font-semibold">
                Pipeline Comercial IA
              </h2>

              <p className="text-sm text-slate-400">
                Gestão completa das oportunidades em tempo real
              </p>

            </div>


            <PipelineBoard />

          </div>



          {/* IA */}

          <div className="
            rounded-2xl
            bg-slate-900
            border
            border-slate-800
            p-6
          ">

            <div className="mb-5">

              <h2 className="text-xl font-semibold">
                Atlas AI Control
              </h2>

              <p className="text-sm text-slate-400">
                Recomendações inteligentes para vendas
              </p>

            </div>


            <AIControlCenter />


          </div>


        </section>




        {/* FOLLOW UP */}

        <section className="
          rounded-2xl
          bg-slate-900
          border
          border-slate-800
          p-6
        ">


          <FollowUp />


        </section>



      </div>


    </main>

  );

}
