import {LeadStatus} from "./Lead"



export const pipeline:LeadStatus[]=[

"novo",

"contato",

"qualificado",

"visita",

"proposta",

"negociacao",

"vendido",

"perdido"

]



export function getNextStatus(
status:LeadStatus
){


const position =
pipeline.indexOf(status)



return (
pipeline[position+1]
||
status
)

}
