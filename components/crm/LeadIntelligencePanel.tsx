export default function LeadIntelligencePanel({
intelligence
}:any){


return (

<div className="
bg-black
text-white
rounded-2xl
p-6
">


<h2 className="text-xl font-bold">

🤖 Atlas Intelligence

</h2>


<p>
Score:
{intelligence.score}
</p>


<p>
Temperatura:
{intelligence.temperature}
</p>


<p>
Probabilidade:
{intelligence.probability}%

</p>


<p>
Próxima ação:

{intelligence.nextAction}

</p>


</div>

)

}
