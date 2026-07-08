"use client"

import {
Brain,
Phone,
DollarSign
} from "lucide-react"



const etapas=[
"Novo Lead",
"Qualificado IA",
"Visita",
"Proposta",
"Negociação",
"Venda"
]


const leads=[

{
nome:"Carlos Mendes",
produto:"Arvo Paraíso",
score:92,
valor:"R$850 mil",
etapa:"Qualificado IA"
},

{
nome:"Mariana Silva",
produto:"Inside Perdizes",
score:78,
valor:"R$620 mil",
etapa:"Visita"
},

{
nome:"Thiago Teste",
produto:"Atlas Demo",
score:40,
valor:"R$450 mil",
etapa:"Novo Lead"
}


]


export default function CRM(){


return (

<div className="p-8">


<h1 className="text-4xl font-bold">
Atlas AI CRM
</h1>


<p className="text-zinc-400">
Gestão comercial inteligente
</p>



<div className="
grid grid-cols-6 gap-4 mt-10
">


{
etapas.map(etapa=>(

<div 
className="
bg-zinc-900 
rounded-xl 
p-4
min-h-[500px]
">


<h2 className="font-bold mb-5">
{etapa}
</h2>



{
leads
.filter(
lead=>lead.etapa===etapa
)
.map(lead=>(


<div 
className="
bg-zinc-800
rounded-xl
p-4
mb-4
">


<h3 className="font-bold">
{lead.nome}
</h3>


<p className="text-sm">
{lead.produto}
</p>


<div className="mt-3 flex gap-2">

<Brain size={16}/>

Score:
{lead.score}

</div>



<div className="flex gap-2">

<DollarSign size={16}/>

{lead.valor}

</div>



</div>


))

}



</div>

))

}


</div>


</div>

)

}
