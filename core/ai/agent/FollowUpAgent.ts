export class FollowUpAgent {



createMessage(

customer:string

){


return {


channel:
"whatsapp",


message:

`Olá ${customer}, encontrei uma oportunidade que combina com seu perfil.`


};


}



}



export const followUpAgent =
new FollowUpAgent();
