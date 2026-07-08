import CustomerHeader from "./CustomerHeader";
import CustomerProfileCard from "./CustomerProfileCard";
import CustomerScore from "./CustomerScore";
import CustomerAIInsights from "./CustomerAIInsights";
import CustomerJourney from "./CustomerJourney";
import CustomerTimeline from "./CustomerTimeline";
import CustomerDeals from "./CustomerDeals";
import CustomerProperties from "./CustomerProperties";
import CustomerActions from "./CustomerActions";
import CustomerFinancialProfile from "./CustomerFinancialProfile";
import CustomerCommunication from "./CustomerCommunication";
import CustomerBehavior from "./CustomerBehavior";
import CustomerPrediction from "./CustomerPrediction";


export default function Customer360(){

return(

<div className="space-y-8">

<CustomerHeader/>

<div className="grid grid-cols-12 gap-6">

<div className="col-span-8 space-y-6">

<CustomerProfileCard/>

<CustomerJourney/>

<CustomerTimeline/>

<CustomerDeals/>

<CustomerFinancialProfile/>

<CustomerCommunication/>

</div>


<div className="col-span-4 space-y-6">

<CustomerScore/>

<CustomerAIInsights/>

<CustomerPrediction/>

<CustomerProperties/>

<CustomerBehavior/>

<CustomerActions/>

</div>

</div>

</div>

)

}
