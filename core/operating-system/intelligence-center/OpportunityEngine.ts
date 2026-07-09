export interface Opportunity {

  type:string;
  description:string;
  score:number;

}


export class OpportunityEngine {


  detect(data:any):Opportunity[]{


    return [

      {
        type:"lead",
        description:
        "Lead com alta intenção de compra",
        score:90
      },

      {
        type:"property",
        description:
        "Imóvel compatível encontrado",
        score:85
      }

    ];


  }


}
