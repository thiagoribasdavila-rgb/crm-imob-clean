export class CallSummary {


generate(

conversation:string

){


return {


summary:

"Cliente interessado em imóvel premium.",


objections:[

"condição financeira"

],


nextAction:

"Enviar simulação"


};


}


}


export const callSummary =
new CallSummary();
