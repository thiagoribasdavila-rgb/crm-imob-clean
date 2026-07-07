export default function FunnelAnalyticsPage() {

const stages = [
  {name:"Leads Captados", value:"15.420"},
  {name:"Contato Realizado", value:"8.240"},
  {name:"Lead Qualificado", value:"3.280"},
  {name:"Visitas", value:"486"},
  {name:"Propostas", value:"120"},
  {name:"Vendas", value:"42"},
];


return (

<main className="min-h-screen bg-slate-950 text-white p-8">

<h1 className="text-4xl font-bold">
Funil Comercial
</h1>

<p className="text-slate-400 mt-2">
Acompanhamento da jornada do cliente
</p>


<div className="mt-10 space-y-5">


{stages.map((stage,index)=>(

<div 
key={stage.name}
className="bg-slate-900 rounded-xl p-6"
>

<div className="flex justify-between">

<h2 className="font-semibold">
{index+1}. {stage.name}
</h2>

<span className="text-xl font-bold">
{stage.value}
</span>

</div>


<div className="mt-4 h-3 bg-slate-800 rounded">

<div 
className="h-3 bg-blue-500 rounded"
style={{
width:`${100-index*15}%`
}}
/>

</div>


</div>

))}


</div>

</main>

)

}
