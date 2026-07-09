export class ScenarioSimulator {


simulate(
scenario:any
){


return {

scenario,

possibleResults:[

{
result:"positive",
probability:0.7
},

{
result:"negative",
probability:0.3
}

],

timestamp:new Date()

};


}


}
