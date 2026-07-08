import { Lead } from "@/domain"


export const leads:Lead[]=[

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

nextAction:
"Ligar hoje",

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

scoreIA:70,

temperature:"morno",

assignedTo:"Diego",

nextAction:
"Confirmar visita",

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

scoreIA:20,

temperature:"frio",

createdAt:new Date()

}

]
