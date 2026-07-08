"use client"


import KanbanBoard
from "@/components/crm/KanbanBoard"


import CRMStats
from "@/components/crm/CRMStats"


import AIRecommendation
from "@/components/crm/AIRecommendation"


import {leads}
from "@/lib/data/leads"



export default function CRMPage(){



return(


<div className="space-y-8">


<CRMStats/>


<AIRecommendation/>


<KanbanBoard

leads={leads}

/>


</div>


)


}
