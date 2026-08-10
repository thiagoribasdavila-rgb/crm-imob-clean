import {
CommunicationResult
}
from "./CommunicationResult";


export class WhatsAppAgent {


reply(

message:string

):CommunicationResult{


return {


success:true,


channel:"whatsapp",


response:

`Mensagem analisada pelo Atlas: ${message}`,


nextAction:
"Registrar interação no CRM",


confidence:90


};


}


}


export const whatsappAgent =
new WhatsAppAgent();
