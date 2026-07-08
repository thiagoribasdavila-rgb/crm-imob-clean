import {Lead} from "./Lead"



export function calculateLeadScore(
lead:Lead
){


let score=0



if(
lead.source==="Meta Ads"
){
score+=20
}



if(
lead.product
){
score+=20
}



if(
lead.status==="qualificado"
){
score+=30
}



if(
lead.status==="visita"
){
score+=50
}



if(
lead.status==="proposta"
){
score+=70
}



if(
lead.status==="negociacao"
){
score+=85
}



return score



}



export function classifyLead(
score:number
){


if(score>=80)

return "Quente"



if(score>=50)

return "Morno"



return "Frio"



}
