import CRMStats 
from "@/components/crm/CRMStats";


import {
leadQuery
}
from "@/application/lead/LeadQueryService";



export default async function CRMPage(){


const data =
await leadQuery.getDashboard();



return (

<div className="
p-8 space-y-8
">


<h1 className="
text-5xl font-bold
">

Atlas Neural CRM

</h1>


<CRMStats

data={data}

/>


</div>

)

}
