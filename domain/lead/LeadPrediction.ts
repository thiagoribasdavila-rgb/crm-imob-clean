import { Lead } from "./Lead";


export interface LeadPredictionResult {


 leadId:string;


 purchaseProbability:number;


 closingWindow:
 | "imediato"
 | "7 dias"
 | "15-30 dias"
 | "30-90 dias"
 | "indefinido";


 conversionRisk:
 | "baixo"
 | "medio"
 | "alto";


 bestContactChannel:
 | "whatsapp"
 | "telefone"
 | "email";


 recommendedMoment:string;


 confidence:
 | "baixa"
 | "media"
 | "alta";


 explanation:string;

}





export function predictLead(
lead:Lead
):LeadPredictionResult{


 const probability =
 calculatePurchaseProbability(
 lead
 );


 return {


 leadId:
 lead.id,


 purchaseProbability:
 probability,


 closingWindow:
 predictClosingWindow(
 probability
 ),


 conversionRisk:
 calculateRisk(
 probability
 ),


 bestContactChannel:
 recommendChannel(
 lead
 ),


 recommendedMoment:
 recommendMoment(
 lead
 ),


 confidence:
 calculateConfidence(
 probability
 ),


 explanation:
 generateExplanation(
 lead,
 probability
 )

 };


}





function calculatePurchaseProbability(
lead:Lead
){


 let score = 20;



 if(lead.score){

 score += lead.score;

 }



 if(
 lead.status === "qualificado"
 ){

 score +=15;

 }



 if(
 lead.status === "proposta"
 ){

 score +=25;

 }



 if(
 lead.status === "negociacao"
 ){

 score +=35;

 }



 return Math.min(
 score,
 100
 );


}





function predictClosingWindow(
probability:number

){


 if(probability>=90)

 return "imediato";


 if(probability>=70)

 return "7 dias";


 if(probability>=50)

 return "15-30 dias";


 if(probability>=30)

 return "30-90 dias";


 return "indefinido";

}





function calculateRisk(
probability:number

){


 if(probability>=70)

 return "baixo";


 if(probability>=40)

 return "medio";


 return "alto";

}





function recommendChannel(
lead:Lead

){


 if(
 lead.source === "whatsapp"
 )

 return "whatsapp";



 if(
 lead.source === "google"
 )

 return "telefone";



 return "whatsapp";

}





function recommendMoment(
lead:Lead

){


 if(
 lead.status==="negociacao"
 )

 return "Contato imediato";


 if(
 lead.status==="proposta"
 )

 return "Follow-up em até 24 horas";


 return "Nutrição inteligente";

}





function calculateConfidence(
probability:number

){


 if(probability>=80)

 return "alta";


 if(probability>=50)

 return "media";


 return "baixa";

}





function generateExplanation(
lead:Lead,
probability:number

){


 return `

Atlas AI analisou:

Lead:
${lead.name}

Probabilidade estimada:
${probability}%

Status atual:
${lead.status}

A previsão considera:
- estágio do funil
- score
- comportamento
- intenção comercial

`;

}
