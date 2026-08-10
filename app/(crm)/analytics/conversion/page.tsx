export default function ConversionAnalyticsPage(){

const metrics=[
{
title:"Conversão Lead → Venda",
value:"1,2%"
},
{
title:"CPL Médio",
value:"R$ 42,50"
},
{
title:"CAC",
value:"R$ 3.850"
},
{
title:"ROI Marketing",
value:"8,4x"
}
];


return(

<main className="min-h-screen bg-slate-950 text-white p-8">

<h1 className="text-4xl font-bold">
Conversion Analytics
</h1>

<p className="text-slate-400 mt-2">
Análise de eficiência comercial
</p>


<div className="grid md:grid-cols-4 gap-6 mt-8">


{metrics.map(item=>(

<div
key={item.title}
className="bg-slate-900 rounded-xl p-6"
>

<p className="text-slate-400">
{item.title}
</p>

<h2 className="text-3xl font-bold mt-3">
{item.value}
</h2>


</div>

))}


</div>


<div className="bg-slate-900 rounded-xl p-6 mt-8">

<h2 className="text-xl font-bold">
Conversão por etapa
</h2>


<div className="mt-5 space-y-4">

<p>Lead → Contato: 53%</p>

<p>Contato → Visita: 14%</p>

<p>Visita → Proposta: 25%</p>

<p>Proposta → Venda: 35%</p>


</div>

</div>


</main>

)

}
