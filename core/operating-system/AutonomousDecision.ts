export interface AutonomousDecision {


type:

"alert"
|
"task"
|
"recommendation";


priority:

"low"
|
"medium"
|
"high";


description:string;


action:string;


confidence:number;


}
