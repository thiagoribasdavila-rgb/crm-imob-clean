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


export function nextStage(
status:LeadStatus
){


const index=
pipeline.indexOf(status)



return pipeline[index+1] || status


}
