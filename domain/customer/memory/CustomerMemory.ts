export interface CustomerMemory {

id:string;

customerId:string;


// tipo de memória

type:
| "preference"
| "behavior"
| "conversation"
| "purchase"
| "objection"
| "emotion";



// informação aprendida

content:string;



// confiança da IA

confidence:number;



source:
| "whatsapp"
| "call"
| "visit"
| "crm"
| "agent";



createdAt:Date;


}
