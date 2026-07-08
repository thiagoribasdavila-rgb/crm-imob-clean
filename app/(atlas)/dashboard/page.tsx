export default function Dashboard(){

const cards=[
["Leads","12.540"],
["VGV Pipeline","R$85M"],
["Conversão IA","18%"],
["Previsão","32 vendas"]
]


return (

<div className="p-10">


<h1 className="text-4xl font-bold">
Dashboard Executivo
</h1>


<p className="text-gray-400 mt-2">
Inteligência comercial em tempo real
</p>



<div className="grid grid-cols-4 gap-6 mt-10">


{
cards.map((c)=>(
<div className="bg-zinc-900 rounded-2xl p-6">

<p className="text-gray-400">
{c[0]}
</p>

<h2 className="text-3xl font-bold mt-3">
{c[1]}
</h2>


</div>
))
}


</div>



<div className="grid grid-cols-2 gap-6 mt-10">


<div className="bg-zinc-900 rounded-2xl p-8">

<h2 className="text-xl font-bold">
Funil Comercial
</h2>


<p className="mt-5">
🟢 Novo Lead — 8500
</p>

<p>
🟡 Qualificado — 3200
</p>

<p>
🔵 Visita — 900
</p>

<p>
🟣 Proposta — 350
</p>

<p>
🏆 Venda — 80
</p>


</div>



<div className="bg-zinc-900 rounded-2xl p-8">

<h2 className="text-xl font-bold">
🤖 Atlas Copilot
</h2>


<p className="mt-5 text-gray-300">

"Thiago, encontrei 42 leads com
probabilidade alta de compra."

</p>


</div>


</div>


</div>

)

}
