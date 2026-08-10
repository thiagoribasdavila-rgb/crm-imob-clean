import { Lead } from "./Lead";
import { calculateLeadScore } from "./LeadScoring";
import { generateAIAction } from "./LeadAI";
import { pipeline } from "./LeadPipeline";


export interface LeadIntelligenceResult {

 leadId:string;

 score:number;

 temperature:
 | "frio"
 | "morno"
 | "quente"
 | "vip";


 intent:
 | "curiosidade"
 | "pesquisa"
 | "interesse"
 | "compra"
 | "urgente";


 probability:number;


 priority:
 | "baixa"
 | "media"
 | "alta"
 | "critica";


 stage:string;


 nextAction:string;


 buyerProfile:string;


 insights:string[];


 summary:string;

}




export function analyzeLead(
 lead:Lead
):LeadIntelligenceResult{


 const score =
 calculateLeadScore(lead);



 const temperature =
 getTemperature(score);



 const intent =
 detectIntent(lead);



 const probability =
 calculateProbability(score);



 const priority =
 getPriority(score);



 const action =
 generateAIAction(lead);



 return {


 leadId:lead.id,


 score,


 temperature,


 intent,


 probability,


 priority,


 stage:lead.status,


 nextAction:
 action.action,


 buyerProfile:
 classifyBuyer(lead),


 insights:[
 "Análise comportamental executada",
 "Score calculado pela IA",
 "Pipeline analisado",
 "Próxima ação gerada"
 ],


 summary:
 `
Cliente ${lead.name}
classificado como ${temperature}.
Probabilidade estimada:
${probability}%.
Próxima ação:
${action.action}
`

 };

}





function getTemperature(score:number){

 if(score>=90)
 return "vip";

 if(score>=70)
 return "quente";

 if(score>=40)
 return "morno";

 return "frio";

}





function detectIntent(
lead:Lead
){

 switch(lead.status){

 case "negociacao":
 return "urgente";

 case "proposta":
 return "compra";

 case "qualificado":
 return "interesse";

 default:
 return "pesquisa";

 }

}





function calculateProbability(
score:number
){

 return Math.min(
 score,
 100
 );

}




function getPriority(score:number){

 if(score>=90)
 return "critica";

 if(score>=70)
 return "alta";

 if(score>=40)
 return "media";

 return "baixa";

}




function classifyBuyer(
lead:Lead
){

 if(lead.budget &&
 lead.budget>1000000)

 return "Investidor Alto Padrão";


 if(lead.budget &&
 lead.budget>500000)

 return "Comprador Premium";


 return "Comprador Residencial";

}
