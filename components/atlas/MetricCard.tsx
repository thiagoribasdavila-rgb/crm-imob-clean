export default function MetricCard({
title,
value,
description,
icon
}:{
title:string
value:string
description:string
icon:string
}){


return (

<div
className="
bg-zinc-900
border
border-zinc-800
rounded-2xl
p-6
hover:border-zinc-600
transition
">


<div className="flex justify-between">

<span className="text-2xl">
{icon}
</span>

</div>


<p className="text-zinc-400 mt-4">
{title}
</p>


<h2 className="
text-4xl
font-bold
mt-2
">
{value}
</h2>


<p className="
text-sm
text-zinc-500
mt-3
">
{description}
</p>


</div>


)

}
