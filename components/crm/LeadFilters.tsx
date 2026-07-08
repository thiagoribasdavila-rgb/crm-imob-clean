"use client"


export default function LeadFilters(){

return (

<div className="
flex
gap-4
mb-6
">


<select className="
bg-zinc-900
p-3
rounded-xl
">

<option>
Todos
</option>

<option>
Quentes
</option>

<option>
VIP
</option>


<option>
Sem contato
</option>


</select>


<input

placeholder="Buscar lead..."

className="
bg-zinc-900
p-3
rounded-xl
"

/>


</div>

)

}
