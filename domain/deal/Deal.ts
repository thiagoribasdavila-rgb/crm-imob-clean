export interface Deal{


id:string


leadId:string


propertyId:string


value:number


status:
"aberta" |
"proposta" |
"fechada" |
"cancelada"


commission?:number


createdAt:Date


}
