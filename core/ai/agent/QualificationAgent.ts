import {
AgentContext
}
from "./AgentContext";


export class QualificationAgent {


qualify(

context:AgentContext

){


return {


score:
context.leadScore,


qualified:

context.leadScore >=70,


reason:

context.leadScore >=70

?

"Alta intenção"

:

"Necessita nutrição"


};


}


}


export const qualificationAgent =
new QualificationAgent();
