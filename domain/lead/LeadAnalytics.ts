export interface LeadMetrics {


score:number;


conversionProbability:number;


daysInPipeline:number;


}



export function calculateLeadMetrics(
lead:any
):LeadMetrics{


return {


score:
lead.score || 0,


conversionProbability:
Math.min(
lead.score || 0,
100
),


daysInPipeline:
calculateDays(
lead.created_at
)


};


}



function calculateDays(
date?:string
){


if(!date)

return 0;



const created =
new Date(date).getTime();


const now =
Date.now();


return Math.floor(
(now-created)
/
86400000
);


}
