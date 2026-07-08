import {
AgentContext
}
from "./AgentContext";


import {
AgentResult
}
from "./AgentResult";


export class SalesAgent {


execute(

context:AgentContext

):AgentResult{


return {


success:true,


action:
"analisar oportunidade",


message:

`Cliente ${context.customerId} analisado pelo Atlas`,


priority:

context.leadScore > 80
?
"high"
:
"medium",


confidence:
90


};


}


}



export const salesAgent =
new SalesAgent();
