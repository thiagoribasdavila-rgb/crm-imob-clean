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
"Realizar primeiro contato em até 5 minutos"

}

}



if(
lead.scoreIA>=80
){

return {

priority:"urgente",

action:
"Agendar visita imediatamente"

}

}



if(
lead.status==="proposta"
){

return {

priority:"alta",

action:
"Enviar simulação financeira e fazer follow-up"

}

}



return {


priority:"normal",

action:
"Manter nutrição automática"

}


}
