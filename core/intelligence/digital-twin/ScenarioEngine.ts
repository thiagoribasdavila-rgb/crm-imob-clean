export class ScenarioEngine {


create(

name:string,

changes:any

){


return {


scenario:name,


changes


};


}


}


export const scenarioEngine =
new ScenarioEngine();
