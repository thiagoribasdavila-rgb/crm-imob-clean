import {
analyzeLead,
predictLead,
generateLeadRecommendation,
generateAutomation
}
from "@/domain/lead";


export class LeadApplicationService {



async processLead(
lead:any
){


const intelligence =
analyzeLead(
lead
);



const prediction =
predictLead(
lead
);



const recommendation =
generateLeadRecommendation(
lead
);



const automation =
generateAutomation(
lead
);



return {


lead,


intelligence,


prediction,


recommendation,


automation


};


}



async processMany(
leads:any[]
){


return Promise.all(

leads.map(

lead=>
this.processLead(lead)

)

);


}


}


export const leadApplication =
new LeadApplicationService();
