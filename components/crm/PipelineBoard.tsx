import PipelineColumn from "./PipelineColumn"



const stages=[

"Novo",

"Contato",

"Qualificado",

"Visita",

"Proposta",

"Negociação",

"Venda"

]



export default function PipelineBoard(){


return (

<div className="
grid
grid-cols-7
gap-4
overflow-x-auto
">


{

stages.map(stage=>(

<PipelineColumn

key={stage}

title={stage}

/>

))

}


</div>

)

}
