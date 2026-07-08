"use client"

import Link from "next/link"


export default function Sidebar(){

return (

<aside className="
w-64
min-h-screen
bg-black
text-white
p-6
">


<h1 className="
text-3xl
font-bold
mb-10
">
ATLAS AI
</h1>


<nav className="space-y-5">


<Link href="/atlas/dashboard">
Dashboard
</Link>


<Link href="/atlas/crm">
CRM Inteligente
</Link>


<Link href="/atlas/leads">
Leads IA
</Link>


<Link href="/atlas/pipeline">
Pipeline
</Link>


<Link href="/atlas/ia">
IA Engine
</Link>


<Link href="/atlas/analytics">
Analytics
</Link>


</nav>


</aside>

)

}
