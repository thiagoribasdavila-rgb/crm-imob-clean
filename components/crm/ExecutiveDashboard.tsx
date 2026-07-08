export default function ExecutiveDashboard(){

const cards=[
{
title:"Leads hoje",
value:"248"
},
{
title:"Leads VIP",
value:"32"
},
{
title:"Pipeline",
value:"R$ 18,4M"
},
{
title:"Conversão",
value:"12,8%"
}
]


return (

<div className="
grid
grid-cols-4
gap-6
">


{
cards.map(card=>(

<div
key={card.title}
className="
bg-zinc-900
rounded-2xl
p-6
border
border-zinc-800
"
>

<p className="
text-zinc-400
">

{card.title}

</p>


<h2 className="
text-4xl
font-bold
mt-3
">

{card.value}

</h2>


</div>


))

}


</div>

)

}
