const stages=[
{
name:"Novo Lead",
value:320
},
{
name:"Qualificado IA",
value:180
},
{
name:"Visita",
value:70
},
{
name:"Proposta",
value:35
},
{
name:"Negociação",
value:15
},
{
name:"Venda",
value:8
}
]


export default function Pipeline(){


return (

<div className="
bg-zinc-900
border
border-zinc-800
rounded-2xl
p-6
">


<h2 className="
text-xl
font-bold
mb-6
">
Pipeline Comercial IA
</h2>



<div className="
grid
grid-cols-6
gap-4
">


{
stages.map(stage=>(

<div
key={stage.name}
className="
bg-black
rounded-xl
p-4
"
>

<p className="text-sm text-zinc-400">
{stage.name}
</p>

<h3 className="
text-3xl
font-bold
mt-3
">
{stage.value}
</h3>


</div>


))
}


</div>


</div>


)

}
