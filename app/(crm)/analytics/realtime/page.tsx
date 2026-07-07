export default function RealtimeAnalyticsPage(){

const events=[
"Novo lead recebido via Meta Ads",
"IA qualificou cliente como alta intenção",
"Visita agendada",
"Corretor iniciou atendimento",
"Nova proposta criada"
];


return(

<main className="min-h-screen bg-slate-950 text-white p-8">


<h1 className="text-4xl font-bold">
Realtime Analytics
</h1>


<p className="text-slate-400 mt-2">
Monitoramento em tempo real da operação
</p>



<div className="grid md:grid-cols-3 gap-6 mt-8">


<div className="bg-slate-900 rounded-xl p-6">

<p className="text-slate-400">
Leads online agora
</p>

<h2 className="text-4xl font-bold">
18
</h2>

</div>



<div className="bg-slate-900 rounded-xl p-6">

<p className="text-slate-400">
Conversas abertas
</p>

<h2 className="text-4xl font-bold">
42
</h2>

</div>



<div className="bg-slate-900 rounded-xl p-6">

<p className="text-slate-400">
IA trabalhando
</p>

<h2 className="text-4xl font-bold">
Ativa
</h2>

</div>


</div>



<div className="bg-slate-900 rounded-xl p-6 mt-8">


<h2 className="text-xl font-bold mb-5">
Atividades recentes
</h2>


<div className="space-y-4">


{
events.map((event,index)=>(

<div
key={index}
className="border-b border-slate-800 pb-3"
>

{event}

</div>


))
}


</div>


</div>


</main>

)

}
