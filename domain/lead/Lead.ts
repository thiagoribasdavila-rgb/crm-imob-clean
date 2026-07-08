export type LeadStatus =
|
"novo"
|
"qualificado"
|
"visita"
|
"proposta"
|
"negociacao"
|
"vendido"
|
"perdido"



export type LeadTemperature =
|
"frio"
|
"morno"
|
"quente"



export interface Lead {


id:string


name:string


email:string


phone:string


source:string


product:string


status:LeadStatus


scoreIA:number


temperature:LeadTemperature


assignedTo:string


nextAction:string


createdAt:Date


}
