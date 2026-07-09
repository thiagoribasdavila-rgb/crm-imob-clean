export type AgentTaskType =

"qualification"
|
"sales"
|
"followup"
|
"negotiation"
|
"property_match"
|
"marketing";



export interface AgentTask {


id:string;


customerId:string;


type:AgentTaskType;


priority:

"low"
|
"medium"
|
"high";


payload?:Record<string,any>;


createdAt:Date;


}
