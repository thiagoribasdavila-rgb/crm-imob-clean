export default function CRMStats({
metrics
}:any){


const cards=[

[
"Leads",
metrics.total
],

[
"Qualificados",
metrics.qualified
],

[
"Visitas",
metrics.visits
],

[
"Propostas",
metrics.proposals
],

[
"Vendas",
metrics.sales
]

]


return (

<div className="
grid
grid-cols-5
gap-5
">


{

cards.map(
(card:any)=>(

<div

key={card[0]}

className="
bg-zinc-900
rounded-xl
p-5
"

>


<p>
{card[0]}
</p>


<h2 className="
text-4xl
font-bold
mt-2
">

{card[1]}

</h2>


</div>

)

)

}


</div>

)

}
