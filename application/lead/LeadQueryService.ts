import {leadService}
from "@/lib/services/leads.services";


export class LeadQueryService {


async getDashboard(){


const leads =
await leadService.getLeads();



return {


total:
leads.length,


hot:
leads.filter(
(l:any)=>
l.temperature==="quente"
).length,


vip:
leads.filter(
(l:any)=>
l.temperature==="vip"
).length,


pipeline:
leads


};


}



async getLead(
id:string
){


return await leadService.getLeadById(id);


}


}


export const leadQuery =
new LeadQueryService();
