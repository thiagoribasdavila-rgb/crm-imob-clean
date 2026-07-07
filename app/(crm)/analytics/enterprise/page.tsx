export default function EnterprisePage(){

const data=[
{
title:"VGV Carteira",
value:"R$ 250 milhões"
},
{
title:"Empreendimentos",
value:"18"
},
{
title:"Unidades Estoque",
value:"426"
},
{
title:"Corretores",
value:"85"
}
];


return(

<main className="min-h-screen bg-slate-950 text-white p-8">

<h1 className="text-4xl font-bold">
Enterprise Analytics
</h1>

<p className="text-slate-400 mt-2">
Visão executiva da operação imobiliária
</p>


<div className="grid md:grid-cols-4 gap-6 mt-8">


{data.map(item=>(

<div
key={item.title}
className="bg-slate-900 rounded-xl p-6"
>

<p className="text-slate-400">
{item.title}
</p>

<h2 className="text-2xl font-bold mt-3">
{item.value}
</h2>


</div>

))}


</div>



<div className="bg-slate-900 rounded-xl p-6 mt-8">


<h2 className="text-xl font-bold mb-4">
Produtos
</h2>


<ul className="space-y-3">

<li>
Arvo - Kallas
</li>

<li>
Inside Perdizes - Teixeira Duarte
</li>

<li>
R2V Paulista
</li>

<li>
Infinity Perdizes
</li>

</ul>


</div>


</main>

)

}
