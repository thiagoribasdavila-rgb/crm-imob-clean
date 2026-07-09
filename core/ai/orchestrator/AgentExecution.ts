export interface AgentExecution {


taskId:string;


agent:string;


status:

"pending"
|
"running"
|
"completed"
|
"failed";


result?:any;


startedAt:Date;


finishedAt?:Date;


}
