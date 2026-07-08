const leads=[
{
nome:"Carlos Mendes",
score:95
},
{
nome:"Maria Silva",
score:91
},
{
nome:"João Oliveira",
score:88
}
]


export default function LeadRanking(){


return (

<div
className="
bg-zinc-900
border
border-zinc-800
rounded-xl
p-6
">


<h2 className="
font-bold
text-xl
mb-5
">
Ranking Inteligente IA
</h2>


{
leads.map(lead=>(

<div
key={lead.nome}
className="
flex
justify-between
border-b
border-zinc-800
py-3
"
>

<span>
{lead.nome}
</span>

<strong>
{lead.score}%
</strong>


</div>

))
}


</div>

)

}
