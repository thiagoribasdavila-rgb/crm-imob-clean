export interface AIAgent {


 name:string;
 role:string;
 status:string;

}



export class AgentManager {


 private agents:AIAgent[]=[

 {

  name:"SalesAgent",
  role:"Vendas",
  status:"active"

 },


 {

  name:"MarketingAgent",
  role:"Marketing",
  status:"active"

 },


 {

  name:"CustomerAgent",
  role:"Relacionamento",
  status:"active"

 }

 ];


 getAgents(){

  return this.agents;

 }


}
