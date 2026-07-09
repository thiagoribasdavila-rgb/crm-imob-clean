export class AnalyticsEngine {


generate(

data:any

){


return {


revenue:data.revenue,


sales:data.sales,


pipeline:data.pipeline


};


}


}



export const analyticsEngine =
new AnalyticsEngine();
