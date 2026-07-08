import Sidebar from "@/components/Sidebar"


export default function AtlasLayout({
  children,
}: {
  children: React.ReactNode
}) {

  return (

    <div className="flex min-h-screen bg-zinc-950 text-white">

      <Sidebar />

      <main className="flex-1 p-8">

        {children}

      </main>

    </div>

  )
}
