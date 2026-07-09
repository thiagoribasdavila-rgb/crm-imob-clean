export class MarketingAI {


analyzeCampaign(

leads:number,

sales:number

){


const efficiency =
sales / Math.max(leads,1);



return {


score:

Math.round(
efficiency*100
),


recommendation:

efficiency > 0.05

?

"Aumentar investimento"

:

"Otimizar campanha"


};


}


}



export const marketingAI =
new MarketingAI();
