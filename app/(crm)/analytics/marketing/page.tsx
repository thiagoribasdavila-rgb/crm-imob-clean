export default function MarketingAnalyticsPage(){

const campaigns=[
{
name:"Meta Ads - Arvo",
leads:"2.400",
cpl:"R$35"
},
{
name:"Google - Perdizes",
leads:"980",
cpl:"R$48"
},
{
name:"Remarketing",
leads:"620",
cpl:"R$22"
}
];


return(

<main className="min-h-screen bg-slate-950 text-white p-8">


<h1 className="text-4xl font-bold">
Marketing Analytics
</h1>


<p className="text-slate-400 mt-2">
Performance de campanhas e aquisição
</p>



<div className="grid md:grid-cols-3 gap-6 mt-8">


<div className="bg-slate-900 rounded-xl p-6">

<p className="text-slate-400">
Investimento mensal
</p>

<h2 className="text-3xl font-bold">
R$25.000
</h2>

</div>


<div className="bg-slate-900 rounded-xl p-6">

<p className="text-slate-400">
Leads gerados
</p>

<h2 className="text-3xl font-bold">
4.000
</h2>

</div>


<div className="bg-slate-900 rounded-xl p-6">

<p className="text-slate-400">
CPL médio
</p>

<h2 className="text-3xl font-bold">
R$42,50
</h2>

</div>


</div>




<div className="bg-slate-900 rounded-xl p-6 mt-8">


<h2 className="text-xl font-bold mb-5">
Campanhas
</h2>


{
campaigns.map(item=>(

<div
key={item.name}
className="flex justify-between border-b border-slate-800 py-3"
>


<span>
{item.name}
</span>


<span>
{item.leads} | {item.cpl}
</span>


</div>


))
}


</div>


</main>

)

}
