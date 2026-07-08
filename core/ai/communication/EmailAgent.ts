export class EmailAgent {


process(

email:string

){


return {


channel:"email",


summary:

email.substring(0,100),


action:
"Atualizar CRM"


};


}


}


export const emailAgent =
new EmailAgent();
