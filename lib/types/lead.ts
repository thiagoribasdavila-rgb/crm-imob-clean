export type LeadStatus =
| "novo"
| "qualificado"
| "visita"
| "proposta"
| "negociacao"
| "vendido"
| "perdido"


export interface Lead {

id:string

nome:string

telefone:string

email:string

produto:string

origem:string

status:LeadStatus

scoreIA:number

temperatura:
"frio" |
"morno" |
"quente"


ultimaInteracao:string

proximaAcao:string

corretor:string

valorPotencial:number

}
