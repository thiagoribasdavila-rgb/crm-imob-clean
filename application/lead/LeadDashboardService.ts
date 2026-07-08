export interface DashboardMetrics {


total:number;


qualified:number;


visits:number;


proposals:number;


sales:number;


conversion:number;


}



export function calculateDashboard(
leads:any[]
):DashboardMetrics{


const total =
leads.length;


const qualified =
leads.filter(
l=>l.status==="qualificado"
).length;



const visits =
leads.filter(
l=>l.status==="visita"
).length;



const proposals =
leads.filter(
l=>l.status==="proposta"
).length;



const sales =
leads.filter(
l=>l.status==="vendido"
).length;



return {


total,


qualified,


visits,


proposals,


sales,


conversion:
total
?
(sales/total)*100
:
0


};


}
