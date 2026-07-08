import CustomerHeader from "./CustomerHeader";
import CustomerProfileCard from "./CustomerProfileCard";
import CustomerScore from "./CustomerScore";
import CustomerAIInsights from "./CustomerAIInsights";
import CustomerJourney from "./CustomerJourney";
import CustomerTimeline from "./CustomerTimeline";
import CustomerDeals from "./CustomerDeals";
import CustomerProperties from "./CustomerProperties";
import CustomerActions from "./CustomerActions";


export default function Customer360(){

return (

<div className="space-y-6">

<CustomerHeader/>

<div className="grid grid-cols-3 gap-6">

<div className="col-span-2 space-y-6">

<CustomerProfileCard/>

<CustomerJourney/>

<CustomerTimeline/>

<CustomerDeals/>

</div>


<div className="space-y-6">

<CustomerScore/>

<CustomerAIInsights/>

<CustomerProperties/>

<CustomerActions/>

</div>


</div>

</div>

)

}
