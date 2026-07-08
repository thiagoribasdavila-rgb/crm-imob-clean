import {
ReasoningContext
}
from "./ReasoningContext";


import {
ReasoningResult
}
from "./ReasoningResult";



export class DecisionEngine {



analyze(

context:ReasoningContext

):ReasoningResult{


if(
context.leadScore > 80
){


return {


decision:
"priorizar atendimento",


confidence:
95,


reason:
"Lead com alta intenção de compra",


nextAction:
"Enviar imóveis compatíveis",


priority:
"high"


};


}



return {


decision:
"nutrir relacionamento",


confidence:
60,


reason:
"Cliente ainda em avaliação",


nextAction:
"Criar novo contato",


priority:
"medium"


};



}


}



export const decisionEngine =
new DecisionEngine();
