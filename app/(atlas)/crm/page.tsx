import KanbanColumn from "@/components/crm/KanbanColumn"


const dados=[

{
nome:"Carlos Mendes",
produto:"Arvo Paraíso",
score:95
},

{
nome:"Maria Silva",
produto:"Inside Perdizes",
score:88
},

{
nome:"João Oliveira",
produto:"Infinity",
score:76
}

]


export default function CRM(){


return (

<div>


<h1 className="
text-5xl
font-bold
mb-8
">
CRM Inteligente
</h1>



<div className="
grid
grid-cols-6
gap-5
">


<KanbanColumn
titulo="Novo Lead"
leads={dados}
/>


<KanbanColumn
titulo="Qualificado IA"
leads={[]}
/>


<KanbanColumn
titulo="Visita"
leads={[]}
/>


<KanbanColumn
titulo="Proposta"
leads={[]}
/>


<KanbanColumn
titulo="Negociação"
leads={[]}
/>


<KanbanColumn
titulo="Venda"
leads={[]}
/>


</div>


</div>

)

}
