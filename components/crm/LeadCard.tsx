export default function LeadCard({
nome,
produto,
score,
status
}:{
nome:string
produto:string
score:number
status:string
}){


return (

<div className="
bg-zinc-900
border
border-zinc-800
rounded-xl
p-4
hover:border-blue-500
transition
">


<h3 className="
font-bold
text-lg
">
{nome}
</h3>


<p className="text-zinc-400 text-sm mt-2">
{produto}
</p>


<div className="
flex
justify-between
mt-4
">


<span>
{status}
</span>


<strong className="
text-green-400
">
{score}%
</strong>


</div>


</div>

)

}
