import CustomerHeader from "./CustomerHeader";

import CustomerProfileCard from "./CustomerProfileCard";
import CustomerScore from "./CustomerScore";
import CustomerAIInsights from "./CustomerAIInsights";

import CustomerJourney from "./CustomerJourney";
import CustomerTimeline from "./CustomerTimeline";
import CustomerMemoryTimeline from "./CustomerMemoryTimeline";

import CustomerDeals from "./CustomerDeals";
import CustomerProperties from "./CustomerProperties";

import CustomerActions from "./CustomerActions";

import CustomerFinancialProfile from "./CustomerFinancialProfile";
import CustomerCommunication from "./CustomerCommunication";
import CustomerBehavior from "./CustomerBehavior";
import CustomerPrediction from "./CustomerPrediction";


// INTELLIGENCE LAYER

import CustomerCommandCenter 
from "./intelligence/CustomerCommandCenter";

import CustomerDigitalTwin 
from "./intelligence/CustomerDigitalTwin";

import CustomerMemory 
from "./intelligence/CustomerMemory";

import CustomerMemoryScore 
from "./intelligence/CustomerMemoryScore";

import CustomerRelationshipGraph 
from "./intelligence/CustomerRelationshipGraph";

import CustomerEmotionAI 
from "./intelligence/CustomerEmotionAI";

import CustomerAutonomousAgent 
from "./intelligence/CustomerAutonomousAgent";

import CustomerAgent 
from "./intelligence/CustomerAgent";

import CustomerWealthProfile 
from "./intelligence/CustomerWealthProfile";

import CustomerLifetime 
from "./intelligence/CustomerLifetime";

import DealSimulator 
from "./intelligence/DealSimulator";

import NextBestAction 
from "./intelligence/NextBestAction";

import SalesCopilot 
from "./intelligence/SalesCopilot";

import SmartPropertyMatch 
from "./intelligence/SmartPropertyMatch";



export default function Customer360(){


return (

<div className="
space-y-8
">


{/* HEADER DO CLIENTE */}

<CustomerHeader />



{/* CENTRAL EXECUTIVA */}

<CustomerCommandCenter />



{/* PERFIL 360 */}

<div className="
grid
grid-cols-12
gap-6
">


<div className="
col-span-8
space-y-6
">


<CustomerProfileCard />


<CustomerJourney />


<CustomerTimeline />


<CustomerMemoryTimeline />


<CustomerDeals />


<CustomerProperties />


<CustomerCommunication />


<CustomerActions />


</div>




<div className="
col-span-4
space-y-6
">


<CustomerScore />


<CustomerAIInsights />


<CustomerPrediction />


<CustomerFinancialProfile />


<CustomerBehavior />


<CustomerMemoryScore />


</div>


</div>





{/* CAMADA DE INTELIGÊNCIA ATLAS */}

<div className="
space-y-6
">


<h2 className="
text-3xl
font-bold
">

🧠 Atlas Customer Intelligence

</h2>



<CustomerDigitalTwin />


<CustomerMemory />


<CustomerRelationshipGraph />


<CustomerEmotionAI />



<CustomerAutonomousAgent />


<CustomerAgent />


<NextBestAction />



<SmartPropertyMatch />



<CustomerWealthProfile />



<DealSimulator />


<SalesCopilot />


<CustomerLifetime />



</div>


</div>


)

}
