export class RiskEngine {


analyze(

data:any

){


return {


risks:[

"Lead sem contato",
"Produto com baixa conversão"

],


level:

"medium"


};


}


}



export const riskEngine =
new RiskEngine();
