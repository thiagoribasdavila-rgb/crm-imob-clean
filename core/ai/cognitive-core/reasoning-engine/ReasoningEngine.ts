import {GoalPlanner} from "./planning/GoalPlanner";
import {DecisionEngine} from "./decision/DecisionEngine";
import {PredictionEngine} from "./prediction/PredictionEngine";
import {ScenarioSimulator} from "./simulation/ScenarioSimulator";
import {SelfEvaluation} from "./reflection/SelfEvaluation";


export class ReasoningEngine {


planner:GoalPlanner;
decision:DecisionEngine;
prediction:PredictionEngine;
simulation:ScenarioSimulator;
reflection:SelfEvaluation;



constructor(){

this.planner=new GoalPlanner();

this.decision=new DecisionEngine();

this.prediction=new PredictionEngine();

this.simulation=new ScenarioSimulator();

this.reflection=new SelfEvaluation();

}



execute(objective:any){


const plan =
this.planner.create(objective);


const prediction =
this.prediction.analyze(objective);


const scenarios =
this.simulation.run(objective);


const decision =
this.decision.select({

plan,
prediction,
scenarios

});


const evaluation =
this.reflection.review(decision);



return {

plan,

prediction,

scenarios,

decision,

evaluation,

confidence:
evaluation.score,

timestamp:new Date()

};


}


}
