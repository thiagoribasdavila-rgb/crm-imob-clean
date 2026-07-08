export default function Timeline(){

const events=[
"Lead entrou pelo Meta Ads",
"IA qualificou interesse",
"Corretor realizou contato"
]


return(

<div>

<h3>
Histórico
</h3>


{
events.map(
(e)=>
<p key={e}>
• {e}
</p>
)
}


</div>

)

}
