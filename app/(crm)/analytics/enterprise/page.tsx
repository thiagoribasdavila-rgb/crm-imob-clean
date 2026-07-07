export default function EnterpriseAnalyticsPage(){

return(

<main className="min-h-screen bg-gray-950 text-white p-8">

<h1 className="text-3xl font-bold">
Enterprise Analytics
</h1>

<p className="text-gray-400 mt-2">
Visão estratégica da operação imobiliária
</p>


<div className="grid md:grid-cols-3 gap-6 mt-8">


<Card title="VGV Carteira" value="R$ 250M"/>

<Card title="Empreendimentos" value="18"/>

<Card title="Estoque" value="426 unidades"/>


</div>



<div className="bg-gray-900 p-6 rounded-xl mt-8">

<h2 className="text-xl font-bold mb-4">
Ranking Produtos
</h2>


<ul className="space-y-3">

<li>1º Arvo - Kallas</li>

<li>2º Inside Perdizes</li>

<li>3º R2V Paulista</li>

</ul>


</div>


</main>

)

}



function Card({
title,
value
}:{
title:string;
value:string
}){

return(

<div className="bg-gray-900 rounded-xl p-6">

<p className="text-gray-400">
{title}
</p>

<h2 className="text-3xl font-bold mt-3">
{value}
</h2>

</div>

)

}
