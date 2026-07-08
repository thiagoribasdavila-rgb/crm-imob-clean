export default function SmartPropertyMatch(){

const items=[

["Arvo Paraíso","98%"],

["Inside Perdizes","94%"],

["Infinity","89%"]

];


return (

<div className="
bg-white
rounded-xl
p-6
shadow
">


<h2 className="font-bold">

🏠 Smart Match IA

</h2>


{

items.map(item=>(

<p key={item[0]}
className="mt-3"
>

{item[0]}
-
{item[1]}

</p>

))

}


</div>

)

}
