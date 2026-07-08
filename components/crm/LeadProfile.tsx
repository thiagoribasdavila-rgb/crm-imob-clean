export default function LeadProfile({
lead
}:any){


return (

<div className="
bg-zinc-900
rounded-2xl
p-6
text-white
">


<h2 className="
text-2xl
font-bold
">

{lead.name}

</h2>


<div className="
mt-5
space-y-3
">


<p>
📱 {lead.phone}
</p>


<p>
📧 {lead.email}
</p>


<p>
🏠 Interesse:
{lead.productInterest}
</p>


<p>
📊 Status:
{lead.status}
</p>


</div>


</div>

)

}
