"use client"

import Link from "next/link"


const menu = [
{
nome:"Dashboard",
rota:"/atlas/dashboard"
},
{
nome:"CRM Inteligente",
rota:"/atlas/crm"
},
{
nome:"Leads IA",
rota:"/atlas/leads"
},
{
nome:"Pipeline",
rota:"/atlas/pipeline"
},
{
nome:"IA Engine",
rota:"/atlas/ia"
},
{
nome:"Analytics",
rota:"/atlas/analytics"
},
{
nome:"Andromeda Meta",
rota:"/atlas/andromeda"
},
{
nome:"Portal Incorporadora",
rota:"/atlas/portal"
}
]


export default function Sidebar(){


return (

<aside className="
w-72
min-h-screen
bg-black
border-r
border-zinc-800
p-6
">


<h1 className="
text-3xl
font-bold
mb-2
">
ATLAS AI
</h1>


<p className="
text-zinc-400
text-sm
mb-10
">
Real Estate Operating System 2040
</p>


<nav className="space-y-3">


{
menu.map((item)=>(

<Link
key={item.rota}
href={item.rota}
className="
block
rounded-lg
p-3
hover:bg-zinc-800
transition
"
>

{item.nome}

</Link>

))
}


</nav>


</aside>

)

}
