import {Lead} from "./Lead"



export function calculateLeadScore(
lead:Lead
){


let score=0



// origem

if(
lead.source==="Meta Ads"
)
score+=20



if(
lead.source==="Google"
)
score+=25



// produto

if(
lead.product
)
score+=15



// orçamento

if(
lead.budget &&
lead.budget>500000
)
score+=20



// estágio comercial

switch(lead.status){


case "contato":

score+=20

break



case "qualificado":

score+=40

break



case "visita":

score+=60

break



case "proposta":

score+=80

break



case "negociacao":

score+=90

break


}



return score

}




export function getTemperature(
score:number
){


if(score>=85)

return "vip"



if(score>=60)

return "quente"



if(score>=30)

return "morno"



return "frio"


}
