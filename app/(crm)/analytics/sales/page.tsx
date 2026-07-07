export default function SalesAnalyticsPage(){

const sellers=[
{
name:"Corretor A",
sales:"12 vendas",
vgv:"R$ 9,8M"
},
{
name:"Corretor B",
sales:"9 vendas",
vgv:"R$ 7,2M"
},
{
name:"Corretor C",
sales:"7 vendas",
vgv:"R$ 5,4M"
}
];


return(

<main className="min-h-screen bg-slate-950 text-white p-8">


<h1 className="text-4xl font-bold">
Sales Analytics
</h1>


<p className="text-slate-400 mt-2">
Performance comercial e VGV
</p>


<div className="grid md:grid-cols-3 gap-6 mt-8">


<div className="bg-slate-900 p-6 rounded-xl">

<p className="text-slate-400">
VGV Vendido
</p>

<h2 className="text-3xl font-bold">
R$ 38M
</h2>

</div>


<div className="bg-slate-900 p-6 rounded-xl">

<p className="text-slate-400">
Unidades Vendidas
</p>

<h2 className="text-3xl font-bold">
42
</h2>

</div>


<div className="bg-slate-900 p-6 rounded-xl">

<p className="text-slate-400">
Ticket Médio
</p>

<h2 className="text-3xl font-bold">
R$ 904 mil
</h2>

</div>


</div>



<div className="bg-slate-900 rounded-xl p-6 mt-8">

<h2 className="text-xl font-bold mb-5">
Ranking Corretores
</h2>


<div className="space-y-4">

{ sellers.map(seller=>(

<div 
key={seller.name}
className="flex justify-between border-b border-slate-800 pb-3"
>

<span>
{seller.name}
</span>

<span>
{seller.sales} - {seller.vgv}
</span>

</div>

))}

</div>


</div>


</main>

)

}
