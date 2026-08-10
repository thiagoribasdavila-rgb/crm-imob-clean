export type LeadStatus =
| "novo"
| "contato"
| "qualificado"
| "visita"
| "proposta"
| "negociacao"
| "vendido"
| "perdido";


export type LeadTemperature =
| "frio"
| "morno"
| "quente"
| "vip";


export type LeadIntent =
| "curiosidade"
| "pesquisa"
| "interesse"
| "compra"
| "urgente";


export type LeadSource =
| "meta"
| "google"
| "whatsapp"
| "site"
| "indicacao"
| "incorporadora";


export interface LeadAIProfile {


score:number;


temperature:LeadTemperature;


intent:LeadIntent;


probability:number;


buyingSignal:string[];


recommendedAction:string;


nextBestAction:string;


lastAnalysis?:Date;


}



export interface LeadCommercial {


productInterest?:string;


budget?:number;


locationPreference?:string;


unitType?:string;


financing?:boolean;


investor?:boolean;


}



export interface LeadJourney {


firstContact?:Date;


lastContact?:Date;


touchpoints:number;


visits:number;


proposals:number;


}



export interface Lead {


id:string;


name:string;


email?:string;


phone?:string;



source:LeadSource;


campaign?:string;


status:LeadStatus;



commercial:LeadCommercial;



ai:LeadAIProfile;



journey:LeadJourney;



created_at?:Date;


updated_at?:Date;


}
