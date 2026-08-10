import {Lead} from "./Lead"



export function generateAIAction(
lead:Lead
){


if(
lead.status==="novo"
){

return {

priority:"alta",

action:
"Entrar em contato imediatamente"

}

}



if(
lead.scoreIA>=80
){

return {

priority:"urgente",

action:
"Agendar visita e enviar proposta"

}

}



if(
lead.status==="proposta"
){

return {

priority:"alta",

action:
"Realizar follow-up comercial"

}

}



return {

priority:"normal",

action:
"Nutrir automaticamente"

}


}


export function generateLeadSummary(
lead:Lead
){


return `

Lead ${lead.name}

Origem:
${lead.source}


Produto:
${lead.product || "não informado"}


Status:
${lead.status}


Score IA:
${lead.scoreIA}


`

}
