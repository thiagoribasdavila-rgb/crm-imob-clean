export interface BehaviorScore {


 customerId:string;
 intentScore:number;
 profile:string;


}



export class CustomerBehaviorIntelligence {


 analyze(customer:any):BehaviorScore {


  return {

   customerId:
   customer?.id || "unknown",

   intentScore:
   0,

   profile:
   "Perfil em análise"

  };


 }


}
