export interface StrategicPlan {

 goal:string;
 actions:string[];
 timeline:string;

}


export class AutonomousPlanningEngine {


 createPlan(goal:string):StrategicPlan {


 return {


  goal,


  actions:[

   "Analisar dados",
   "Criar estratégia",
   "Executar ações",
   "Medir resultados"

  ],


  timeline:
  "90 dias"


 };


 }


}
