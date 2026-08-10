export default function PipelineColumn({
title
}:{
title:string
}){


return (

<div className="
bg-zinc-900
rounded-xl
p-4
min-h-[500px]
">


<h3 className="
font-bold
mb-5
">

{title}

</h3>


<div className="
text-zinc-500
text-sm
">

Arraste leads aqui

</div>


</div>

)

}
