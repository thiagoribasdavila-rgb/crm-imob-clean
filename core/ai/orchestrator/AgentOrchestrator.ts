import {
AgentTask
}
from "./AgentTask";


import {
AgentDecision
}
from "./AgentDecision";


import {
agentRegistry
}
from "./AgentRegistry";



export class AgentOrchestrator {



decide(

task:AgentTask

):AgentDecision{


let agent="";



switch(task.type){


case "qualification":

agent="QualificationAgent";

break;


case "sales":

agent="SalesAgent";

break;


case "followup":

agent="FollowUpAgent";

break;


case "negotiation":

agent="NegotiationAgent";

break;


case "property_match":

agent="PropertyMatchAgent";

break;


default:

agent="SalesAgent";


}



return {


agent,


reason:
`Tarefa ${task.type} direcionada ao agente especializado`,


confidence:90,


action:
"Executar fluxo inteligente"


};



}



execute(

task:AgentTask

){


const decision =
this.decide(task);



const agent =
agentRegistry.find(
decision.agent
);



if(!agent){

return {

success:false,

message:
"Agente não encontrado"

};

}



return agent.execute(task);


}


}



export const agentOrchestrator =
new AgentOrchestrator();
