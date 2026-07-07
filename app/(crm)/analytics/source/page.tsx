export default function SourceAnalyticsPage(){

const sources=[
["Meta Ads","8.200 leads"],
["Google Ads","2.400 leads"],
["WhatsApp","1.850 leads"],
["Orgânico","1.200 leads"],
["Indicação","450 leads"]
];


return(

<main className="min-h-screen bg-slate-950 text-white p-8">

<h1 className="text-4xl font-bold">
Source Analytics
</h1>

<p className="text-slate-400 mt-2">
Origem dos clientes
</p>


<div className="bg-slate-900 rounded-xl p-6 mt-8">


<h2 className="text-xl font-bold mb-5">
Canais de aquisição
</h2>


<div className="space-y-4">

{
sources.map(source=>(

<div
key={source[0]}
className="flex justify-between border-b border-slate-800 pb-3"
>

<span>
{source[0]}
</span>

<strong>
{source[1]}
</strong>


</div>

))
}


</div>


</div>


</main>

)

}
