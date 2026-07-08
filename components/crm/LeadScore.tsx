"use client"


interface Props {

score:number

temperature:string

}



export default function LeadScore({

score,

temperature

}:Props){



function color(){


if(
temperature==="vip"
)

return "🔥"



if(
temperature==="quente"
)

return "🟢"



if(
temperature==="morno"
)

return "🟡"



return "⚪"


}



return (

<div className="
rounded-xl
border
bg-zinc-900
p-4
text-white
">


<div className="
flex
justify-between
">


<h3>

Score IA

</h3>


<span>

{color()}

</span>


</div>



<div className="
text-4xl
font-bold
mt-3
">

{score}

</div>



<p className="
text-sm
text-zinc-400
mt-2
">

Classificação:

{" "}

{temperature}

</p>



<div className="
mt-3
h-2
bg-zinc-700
rounded
">


<div

className="
h-2
rounded
bg-green-500
"

style={{

width:`${Math.min(score,100)}%`

}}

/>


</div>



</div>

)

}
