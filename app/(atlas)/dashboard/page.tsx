import MetricCard from "@/components/atlas/MetricCard"
import AIInsights from "@/components/atlas/AIInsights"
import Pipeline from "@/components/atlas/Pipeline"
import LeadRanking from "@/components/atlas/LeadRanking"
import RevenueForecast from "@/components/atlas/RevenueForecast"


export default function Dashboard(){


return (

<div className="space-y-8">


<h1 className="
text-5xl
font-bold
">
Atlas Command Center
</h1>


<div className="
grid
grid-cols-5
gap-5
">


<MetricCard
icon="👥"
title="Leads"
value="12.540"
description="Base CRM"
/>


<MetricCard
icon="💰"
title="VGV Pipeline"
value="R$85M"
description="Oportunidades"
/>


<MetricCard
icon="🤖"
title="Score IA"
value="18%"
description="Conversão"
/>


<MetricCard
icon="🏠"
title="Imóveis"
value="320"
description="Disponíveis"
/>


<MetricCard
icon="🔥"
title="Hot Leads"
value="42"
description="Alta intenção"
/>


</div>


<Pipeline/>


<div className="
grid
grid-cols-2
gap-8
">

<AIInsights/>

<LeadRanking/>

</div>


<RevenueForecast/>


</div>

)

}
