import {Lead} from "@/domain"


interface Props{

lead:Lead

}


export default function LeadCard({
lead
}:Props){


return(

<div className="
rounded-xl
border
p-4
bg-white
shadow
">


<h3 className="font-bold">

{lead.name}

</h3>


<p>
🏠 {lead.product}
</p>


<p>
Origem:
{lead.source}
</p>


<p>
Score IA:
<strong>
{lead.scoreIA}
</strong>
</p>


<p>
🔥 {lead.temperature}
</p>


<p>
Próxima ação:
{lead.nextAction}
</p>


</div>

)

}
