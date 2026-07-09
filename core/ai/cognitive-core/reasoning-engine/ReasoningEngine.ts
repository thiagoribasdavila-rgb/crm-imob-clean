import {DecisionPlanner} from "./DecisionPlanner";
import {ScenarioSimulator} from "./ScenarioSimulator";
import {PredictionEngine} from "./PredictionEngine";


export class ReasoningEngine{


planner:DecisionPlanner;

simulator:ScenarioSimulator;

prediction:PredictionEngine;



constructor(){


this.planner=new DecisionPlanner();

this.simulator=new ScenarioSimulator();

this.prediction=new PredictionEngine();


}



reason(context:any){


const plan =
this.planner.createPlan(
context.objective
);



const simulation =
this.simulator.simulate(context);



const prediction =
this.prediction.predict(context);



return {


plan,

simulation,

prediction,


confidence:0.85,


timestamp:new Date()


};



}


}
