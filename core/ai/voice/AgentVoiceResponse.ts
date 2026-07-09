export class AgentVoiceResponse {


generate(

intent:string

){


return {


response:

`Entendi seu interesse em ${intent}. Vou buscar as melhores opções.`


};


}


}


export const agentVoiceResponse =
new AgentVoiceResponse();
