export class MarketingSimulator {


simulate(

budget:number

){


return {


estimatedLeads:

Math.floor(
budget / 50
),


recommendation:

"Escalar campanha com melhor CPL"


};


}


}


export const marketingSimulator =
new MarketingSimulator();
