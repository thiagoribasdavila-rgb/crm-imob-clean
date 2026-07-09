export interface SimulationResult {

 scenario:string;
 impact:string;
 probability:number;
 recommendation:string;

}


export class DecisionSimulator {


 simulate(
  decision:string
 ):SimulationResult {


  return {

   scenario:decision,

   impact:
   "Análise de impacto gerada pelo Atlas",

   probability:
   0,

   recommendation:
   "Executar após validação dos indicadores"

  };


 }


}
