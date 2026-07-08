import CustomerHeader from "./CustomerHeader";

import CustomerProfileCard from "./CustomerProfileCard";
import CustomerScore from "./CustomerScore";
import CustomerAIInsights from "./CustomerAIInsights";

import CustomerJourney from "./CustomerJourney";
import CustomerTimeline from "./CustomerTimeline";

import CustomerDeals from "./CustomerDeals";
import CustomerProperties from "./CustomerProperties";

import CustomerActions from "./CustomerActions";

import CustomerFinancialProfile 
from "./CustomerFinancialProfile";

import CustomerCommunication 
from "./CustomerCommunication";

import CustomerBehavior 
from "./CustomerBehavior";

import CustomerPrediction 
from "./CustomerPrediction";


// NOVOS MÓDULOS IA

import CustomerDigitalTwin 
from "./intelligence/CustomerDigitalTwin";

import CustomerAutonomousAgent 
from "./intelligence/CustomerAutonomousAgent";

import NextBestAction 
from "./intelligence/NextBestAction";

import SmartPropertyMatch 
from "./intelligence/SmartPropertyMatch";

import DealSimulator 
from "./intelligence/DealSimulator";

import SalesCopilot 
from "./intelligence/SalesCopilot";

import CustomerCommandCenter 
from "./intelligence/CustomerCommandCenter";

import CustomerLifetime 
from "./intelligence/CustomerLifetime";


export default function Customer360(){


return (

<div className="
space-y-8
">


{/* HEADER */}

<CustomerHeader />


{/* CENTRAL DE COMANDO */}

<CustomerCommandCenter />



{/* PERFIL PRINCIPAL */}

<div className="
grid
grid-cols-12
gap-6
">


<div className="
col-span-8
space-y-6
">


<CustomerProfileCard/>


<CustomerJourney/>


<CustomerTimeline/>


<CustomerDeals/>


<CustomerProperties/>


<CustomerCommunication/>


</div>



<div className="
col-span-4
space-y-6
">


<CustomerScore/>


<CustomerAIInsights/>


<CustomerPrediction/>


<CustomerFinancialProfile/>


<CustomerBehavior/>


</div>


</div>



{/* INTELIGÊNCIA ARTIFICIAL */}


<div className="
space-y-6
">


<h2 className="
text-2xl
font-bold
">

Atlas Intelligence Layer

</h2>



<CustomerDigitalTwin/>


<CustomerAutonomousAgent/>


<NextBestAction/>


<SmartPropertyMatch/>


<DealSimulator/>


<SalesCopilot/>


<CustomerLifetime/>


</div>



{/* AÇÕES */}

<CustomerActions/>


</div>

)

}
