export default function LeadActionPanel({
recommendation
}:any){


return (

<div className="
bg-black
border
border-zinc-800
rounded-2xl
p-6
text-white
">


<h2 className="
text-xl
font-bold
">

🤖 Próxima ação Atlas AI

</h2>


<div className="
mt-5
space-y-3
">


<p>
{recommendation?.action}
</p>


<button className="
bg-green-600
px-5
py-3
rounded-xl
">

Enviar WhatsApp

</button>


</div>


</div>

)

}
