import {leadService}
from "@/lib/services/leads.services";


export class LeadCommandService {


async moveLead(
id:string,
status:string
){


return await leadService.updateLead(

id,

{
status
}

);


}



async create(
data:any
){


return await leadService.createLead(data);


}



}


export const leadCommand =
new LeadCommandService();
