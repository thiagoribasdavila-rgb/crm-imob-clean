"use client"


import KanbanColumn 
from "./KanbanColumn"


import {Lead}
from "@/domain"



interface Props {

leads: Lead[]

refresh?:()=>void

}



const columns=[

"novo",

"qualificado",

"visita",

"proposta",

"negociacao",

"vendido",

"perdido"

]



export default function KanbanBoard({

leads,

refresh

}:Props){


return(


<div

style={{

display:"flex",

gap:"20px",

overflowX:"auto"

}}

>


{

columns.map((status)=>(


<KanbanColumn

key={status}

status={status}

leads={

leads.filter(

lead=>lead.status===status

)

}

refresh={refresh}


/>


))


}


</div>


)

}
