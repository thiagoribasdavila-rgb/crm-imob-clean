export class SalesForecastAI {


forecast(

pipeline:number,

conversion:number

){


return {


expectedRevenue:

pipeline * conversion,


confidence:

85,


period:

"próximos 90 dias"


};


}


}



export const salesForecastAI =
new SalesForecastAI();
