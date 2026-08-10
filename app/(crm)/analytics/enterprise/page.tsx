export default function EnterpriseAnalyticsPage(){

const data=[
["VGV Carteira","R$250 milhões"],
["Empreendimentos","18"],
["Unidades Estoque","426"],
["Corretores","85"],
["Incorporadoras","12"]
];


return(

<main className="min-h-screen bg-slate-950 text-white p-8">


<h1 className="text-4xl font-bold">
Enterprise Analytics
</h1>


<p className="text-slate-400 mt-2">
Painel estratégico da operação imobiliária
</p>



<div className="grid md:grid-cols-5 gap-5 mt-8">


{
data.map(item=>(

<div
key={item[0]}
className="bg-slate-900 rounded-xl p-5"
>

<p className="text-slate-400 text-sm">
{item[0]}
</p>

<h2 className="text-xl font-bold mt-3">
{item[1]}
</h2>


</div>

))
}


</div>




<div className="bg-slate-900 rounded-xl p-6 mt-8">

<h2 className="text-xl font-bold">
Produtos estratégicos
</h2>


<ul className="mt-5 space-y-3">

<li>Arvo - Kallas</li>
<li>Inside Perdizes - Teixeira Duarte</li>
<li>R2V Paulista</li>
<li>Infinity Perdizes</li>

</ul>


</div>


</main>

)

}
