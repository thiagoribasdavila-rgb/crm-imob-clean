export default function LeadScore({
score
}:{
score:number
}){


let nivel="Baixo"


if(score>80)
nivel="Quente"

else if(score>50)
nivel="Médio"



return (

<div className="
rounded-xl
bg-zinc-900
p-5
">


<h3>
Score IA
</h3>


<div className="
text-4xl
font-bold
mt-3
">
{score}%
</div>


<p>
Classificação: {nivel}
</p>


</div>

)

}
