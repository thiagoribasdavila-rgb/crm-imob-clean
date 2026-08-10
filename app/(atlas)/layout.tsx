import Sidebar from "@/components/layout/Sidebar"

export default function AtlasLayout({
children
}) {

return (

<div className="flex">

<Sidebar />

<main>
{children}
</main>

</div>

)

}
