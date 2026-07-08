"use client"

import {
Users,
Brain,
TrendingUp,
DollarSign
} from "lucide-react"



export default function Dashboard(){


const cards=[
{
title:"Leads",
value:"12.540",
icon:Users
},
{
title:"VGV Pipeline",
value:"R$85M",
icon:DollarSign
},
{
title:"Score IA Médio",
value:"78%",
icon:Brain
},
{
title:"Previsão Venda",
value:"32",
icon:TrendingUp
}
]



return (

<div className="p-10">


<h1 className="text-5xl font-bold">
ATLAS AI
</h1>


<p className="text-zinc-400 mt-2">
Real Estate Operating System 2040
</p>



<div className="
grid 
grid-cols-4 
gap-6 
mt-10
">


{
cards.map((card)=>{

const Icon=card.icon

return(

<div className="card">


<Icon size={32}/>


<p className="text-zinc-400 mt-5">
{card.title}
</p>


<h2 className="text-4xl font-bold mt-2">
{card.value}
</h2>


</div>


)

})

}


</div>





<div className="
grid grid-cols-2 gap-6 mt-10
">


<div className="card">

<h2 className="text-2xl font-bold">
🤖 Atlas Intelligence
</h2>


<p className="mt-5 text-zinc-300">

42 leads possuem alta probabilidade
de compra.

</p>


<p className="mt-3">

Campanha Arvo possui melhor conversão.

</p>


</div>




<div className="card">

<h2 className="text-2xl font-bold">
Pipeline Comercial
</h2>


<div className="mt-5 space-y-3">


<p>
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


</div>


</div>



</div>

)


}
