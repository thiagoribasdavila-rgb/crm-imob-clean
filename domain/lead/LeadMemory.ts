import { Lead } from "./Lead";


export type MemoryType =
| "interaction"
| "visit"
| "message"
| "property_view"
| "proposal"
| "objection"
| "preference";


export interface LeadMemoryEvent {

 id:string;

 leadId:string;

 type:MemoryType;

 description:string;

 metadata?:Record<string,any>;

 createdAt:string;

}



export interface LeadMemoryProfile {


 leadId:string;


 totalInteractions:number;


 lastInteraction?:string;


 interests:string[];


 visitedProperties:string[];


 objections:string[];


 preferences:string[];


 buyingSignals:string[];


 riskFactors:string[];


 summary:string;

}




export function createMemoryEvent(
lead:Lead,
type:MemoryType,
description:string,
metadata?:Record<string,any>

):LeadMemoryEvent{


 return {


 id:
 crypto.randomUUID(),


 leadId:
 lead.id,


 type,


 description,


 metadata,


 createdAt:
 new Date().toISOString()


 };

}




export function buildLeadMemory(
events:LeadMemoryEvent[]
):LeadMemoryProfile{


 const interests:string[]=[];

 const properties:string[]=[];

 const objections:string[]=[];

 const preferences:string[]=[];

 const buyingSignals:string[]=[];

 const riskFactors:string[]=[];



 events.forEach(event=>{


 switch(event.type){


 case "property_view":

 properties.push(
 event.description
 );

 break;



 case "objection":

 objections.push(
 event.description
 );

 break;



 case "preference":

 preferences.push(
 event.description
 );

 break;



 case "interaction":

 buyingSignals.push(
 event.description
 );

 break;


 }


 });



 const score =
 calculateMemoryScore(
 events.length,
 buyingSignals.length
 );



 if(score>70){

 buyingSignals.push(
 "Alta intenção identificada pela IA"
 );

 }


 if(events.length===0){

 riskFactors.push(
 "Sem histórico de relacionamento"
 );

 }



 return {


 leadId:
 events[0]?.leadId || "",


 totalInteractions:
 events.length,


 lastInteraction:
 events.at(-1)?.createdAt,


 interests,


 visitedProperties:
 properties,


 objections,


 preferences,


 buyingSignals,


 riskFactors,


 summary:

 generateMemorySummary(
 score,
 events
 )


 };

}





function calculateMemoryScore(
events:number,
signals:number

){


 let score=0;


 score += events * 5;


 score += signals * 15;


 return Math.min(
 score,
 100
 );


}





function generateMemorySummary(
score:number,
events:LeadMemoryEvent[]

){


 if(events.length===0)

 return "Lead sem histórico analisado.";



 return `

Memória Atlas AI:

Interações registradas:
${events.length}

Score comportamental:
${score}/100

A IA analisou o histórico
e gerou recomendações
baseadas no comportamento.

`;

}
