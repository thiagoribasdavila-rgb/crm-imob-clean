import AppProviders from "@/components/providers/AppProviders"

export default function CRMLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AppProviders>
      <div style={{ minHeight: "100vh", padding: 20 }}>
        {children}
      </div>
    </AppProviders>
  )
}
