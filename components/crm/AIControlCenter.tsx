export default function AIControlCenter(){

const actions=[
"18 leads precisam contato imediato",
"7 clientes possuem alta intenção",
"43 leads estão parados há 15 dias"
]


return (

<div
className="
bg-black
rounded-3xl
p-8
border
border-zinc-800
"
>


<h2 className="
text-3xl
font-bold
">

🤖 Atlas Intelligence

</h2>


<div className="mt-6 space-y-4">


{
actions.map(item=>(

<div
key={item}
className="
bg-zinc-900
p-5
rounded-xl
"
>

{item}

</div>


))

}


</div>


</div>

)

}
