"use client"


import LeadScore from "./LeadScore"

import AIRecommendation from "./AIRecommendation"



export default function LeadCard({

lead

}:any){



return (

<div className="
rounded-2xl
border
bg-zinc-950
text-white
p-5
space-y-4
">


<div>

<h2 className="
text-xl
font-bold
">

{lead.name}

</h2>


<p className="
text-zinc-400
">

{lead.product}

</p>


</div>



<LeadScore

score={lead.scoreIA || 0}

temperature={lead.temperature || "frio"}

/>



{
lead.ai &&

<AIRecommendation

action={lead.ai.action}

priority={lead.ai.priority}

/>

}



</div>

)

}
