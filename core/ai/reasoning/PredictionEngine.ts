import {
ReasoningContext
}
from "./ReasoningContext";


export class PredictionEngine {



predict(

context:ReasoningContext

){


let probability =
context.leadScore;



return {


purchaseProbability:
probability,


risk:

probability > 70
?
"low"
:
"high"



};


}



}


export const predictionEngine =
new PredictionEngine();
