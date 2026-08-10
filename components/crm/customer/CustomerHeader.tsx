export default function CustomerHeader(){

return(

<div className="rounded-2xl bg-white p-8 shadow">

<div className="flex justify-between">


<div>

<h1 className="text-3xl font-bold">
João Silva
</h1>

<p className="text-gray-500">
Cliente Premium • São Paulo
</p>

</div>


<div className="text-right">

<div className="text-green-600 font-bold">
🔥 Cliente Quente
</div>

<p>
Score IA: 92/100
</p>

</div>


</div>

<div className="grid grid-cols-4 gap-4 mt-6">


<div>
Origem
<br/>
Meta Ads
</div>


<div>
Corretor
<br/>
Thiago
</div>


<div>
Último contato
<br/>
Hoje 14:32
</div>


<div>
Probabilidade
<br/>
87%
</div>


</div>

</div>

)

}
