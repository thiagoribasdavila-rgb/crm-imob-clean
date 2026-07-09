export class KPIEngine {


calculateConversion(

leads:number,

sales:number

){


return {


conversion:

(sales/leads)*100


};


}


}



export const kpiEngine =
new KPIEngine();
