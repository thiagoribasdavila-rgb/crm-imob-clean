import CRMHeader from "@/components/crm/CRMHeader";
import ExecutiveDashboard from "@/components/crm/ExecutiveDashboard";
import AIControlCenter from "@/components/crm/AIControlCenter";
import PipelineBoard from "@/components/crm/PipelineBoard";


export default function CRMPage(){

return (

<div className="
p-8
space-y-10
">


<CRMHeader/>


<ExecutiveDashboard/>


<AIControlCenter/>


<PipelineBoard/>


</div>

)

}
