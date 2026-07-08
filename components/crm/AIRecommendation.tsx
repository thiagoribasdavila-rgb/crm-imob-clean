"use client"


interface Props {

action:string

priority:string

}



export default function AIRecommendation({

action,

priority

}:Props){


return (

<div className="
rounded-xl
border
bg-black
text-white
p-4
">


<h3 className="
font-bold
">

🤖 Atlas AI Recommendation

</h3>



<p className="
mt-3
">

{action}

</p>



<span className="
text-sm
text-yellow-400
">

Prioridade:

{" "}

{priority}

</span>


</div>

)

}
