export interface RegisteredAgent {


name:string;


description:string;


execute:
Function;


}



export class AgentRegistry {


private agents:
RegisteredAgent[]=[];



register(
agent:RegisteredAgent
){

this.agents.push(agent);

}



find(
name:string
){

return this.agents.find(

agent=>

agent.name===name

);

}



list(){

return this.agents;

}


}



export const agentRegistry =
new AgentRegistry();
