export class SimulationEngine {


run(

scenario:any

){


return {


scenario,


status:

"simulation completed",


confidence:

82


};


}


}


export const simulationEngine =
new SimulationEngine();
