export type LeadStatus =
| "novo"
| "contato"
| "qualificado"
| "visita"
| "proposta"
| "negociacao"
| "vendido"
| "perdido"



export type LeadTemperature =
| "frio"
| "morno"
| "quente"
| "vip"



export interface Lead {


id:string


name:string


email?:string


phone?:string


source:string


campaign?:string


product?:string


budget?:number


city?:string


status:LeadStatus


scoreIA:number


temperature:LeadTemperature


lastContact?:Date


nextAction?:string


assignedTo?:string


createdAt:Date


}
