import LeadCard from "./LeadCard"


export default function KanbanColumn({
titulo,
leads
}:any){


return (

<div className="
bg-zinc-950
rounded-xl
p-4
min-h-[500px]
">


<h2 className="
font-bold
mb-5
">
{titulo}
</h2>



<div className="space-y-4">


{
leads.map((lead:any)=>(

<LeadCard
key={lead.nome}
nome={lead.nome}
produto={lead.produto}
score={lead.score}
status={titulo}
/>

))
}


</div>


</div>

)

}
