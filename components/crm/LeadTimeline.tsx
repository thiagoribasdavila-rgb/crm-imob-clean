export default function LeadTimeline({
events=[]
}:any){


return (

<div className="
bg-zinc-900
rounded-xl
p-6
">


<h2 className="font-bold text-xl">
Histórico do cliente
</h2>


<div className="mt-5 space-y-3">


{
events.map(
(event:string)=>(

<p key={event}>
• {event}
</p>

)

)

}


</div>


</div>

)

}
