import AppProviders from "@/components/providers/AppProviders"

export default function CRMLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AppProviders>
      <div style={{ minHeight: "100vh" }}>
        {children}
      </div>
    </AppProviders>
  )
}
