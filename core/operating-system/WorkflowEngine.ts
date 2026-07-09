export class WorkflowEngine {


execute(

workflow:string

){


return {


workflow,


status:

"executed"


};


}


}


export const workflowEngine =
new WorkflowEngine();
