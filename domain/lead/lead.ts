export interface Lead {

id:string

name:string

email:string

phone:string

source:string

product:string

status:
"novo" |
"qualificado" |
"visita" |
"proposta" |
"negociacao" |
"vendido" |
"perdido"


scoreIA:number

temperature:
"frio" |
"morno" |
"quente"


assignedTo?:string

lastContact?:Date

nextAction?:string

createdAt:Date

}
