import {
strategyEngine
}
from "./StrategyEngine";


import {
riskEngine
}
from "./RiskEngine";



export class ExecutiveAI {


analyze(

businessData:any

){


return {


strategy:

strategyEngine.recommend(
businessData
),


risks:

riskEngine.analyze(
businessData
)


};


}


}



export const executiveAI =
new ExecutiveAI();
