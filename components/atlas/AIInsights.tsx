export default function AIInsights(){


const insights=[
"42 leads possuem alta intenção de compra",
"Campanha Meta Arvo possui melhor conversão",
"18 clientes precisam follow-up hoje",
"3 oportunidades estão próximas da venda"
]


return (

<div className="
bg-zinc-900
rounded-2xl
border
border-zinc-800
p-6
">


<h2 className="
text-xl
font-bold
mb-5
">
🤖 Atlas AI Insights
</h2>


<div className="space-y-4">


{
insights.map((item,index)=>(

<div
key={index}
className="
bg-zinc-800
rounded-xl
p-4
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
