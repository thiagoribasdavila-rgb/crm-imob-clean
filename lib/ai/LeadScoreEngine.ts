import {Lead} from "@/lib/types/lead"


export function calculateLeadScore(
lead:Lead
){

let score=0


if(lead.status==="qualificado")
score+=30


if(lead.status==="visita")
score+=50


if(lead.status==="proposta")
score+=70


if(lead.valorPotencial>500000)
score+=20


return Math.min(score,100)

}
