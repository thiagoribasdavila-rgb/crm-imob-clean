export default function LeadsAnalyticsPage(){

const cards=[
["Leads Hoje","284"],
["Qualificados IA","76"],
["Sem resposta","32"],
["Conversão","12%"]
];


return (

<main className="min-h-screen bg-slate-950 text-white p-8">

<h1 className="text-4xl font-bold">
Leads Analytics
</h1>


<p className="text-slate-400 mt-2">
Inteligência e qualidade dos leads
</p>


<div className="grid md:grid-cols-4 gap-6 mt-8">


{cards.map(card=>(

<div
key={card[0]}
className="bg-slate-900 rounded-xl p-6"
>

<p className="text-slate-400">
{card[0]}
</p>

<h2 className="text-3xl font-bold mt-3">
{card[1]}
</h2>


</div>

))}


</div>



<div className="bg-slate-900 rounded-xl p-6 mt-8">

<h2 className="text-xl font-bold">
Qualificação dos Leads
</h2>


<ul className="mt-5 space-y-3">

<li>🔥 Alta intenção: 420</li>

<li>⭐ Médio interesse: 980</li>

<li>❄️ Baixo interesse: 1.880</li>


</ul>


</div>


</main>

)

}
