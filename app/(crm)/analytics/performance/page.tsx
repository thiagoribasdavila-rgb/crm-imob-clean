export default function PerformanceAnalyticsPage(){

const indicators=[
{
title:"Atendimentos",
value:"1.842"
},
{
title:"Tempo médio resposta",
value:"3 min"
},
{
title:"Follow-ups realizados",
value:"6.420"
},
{
title:"Tarefas concluídas",
value:"94%"
}
];


return(

<main className="min-h-screen bg-slate-950 text-white p-8">


<h1 className="text-4xl font-bold">
Performance Analytics
</h1>


<p className="text-slate-400 mt-2">
Produtividade da equipe comercial
</p>



<div className="grid md:grid-cols-4 gap-6 mt-8">


{
indicators.map(item=>(

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

))
}


</div>




<div className="bg-slate-900 rounded-xl p-6 mt-8">

