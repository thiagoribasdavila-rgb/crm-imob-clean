import { Lead } from "@/domain"


export const leads: Lead[] = [

{
id:"1",

name:"Carlos Mendes",

email:"carlos@email.com",

phone:"11999999999",

source:"Meta Ads",

product:"Arvo Paraíso",

status:"qualificado",

scoreIA:85,

temperature:"quente",

assignedTo:"Thiago",

nextAction:"Ligação comercial hoje",

createdAt:new Date()

},


{
id:"2",

name:"Mariana Souza",

email:"mariana@email.com",

phone:"11988888888",

source:"Instagram",

product:"Inside Perdizes",

status:"visita",

scoreIA:72,

temperature:"morno",

assignedTo:"Diego",

nextAction:"Confirmar visita",

createdAt:new Date()

},


{
id:"3",

name:"João Silva",

email:"joao@email.com",

phone:"11977777777",

source:"Google",

product:"Infinity",

status:"novo",

scoreIA:25,

temperature:"frio",

assignedTo:"Luciano",

nextAction:"Primeiro contato",

createdAt:new Date()

}

]
