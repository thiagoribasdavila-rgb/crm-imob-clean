export interface LeadJourney {


firstContact?:string;


contacts:number;


visits:number;


proposals:number;


negotiations:number;


lastChannel?:string;


}



export function calculateJourneyStage(
journey:LeadJourney
){


if(journey.negotiations>0)

return "negociacao";


if(journey.proposals>0)

return "proposta";


if(journey.visits>0)

return "visita";


if(journey.contacts>0)

return "contato";


return "novo";


}
