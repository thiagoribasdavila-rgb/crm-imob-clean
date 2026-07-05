import { SupabaseGuard } from "@/components/ui/SupabaseGuard";

export default function CRMLayout({ children }) {
  return (
    <SupabaseGuard>
      <div style={{ display: "flex" }}>
        <aside style={{ width: 250 }}>Menu CRM</aside>
        <main style={{ flex: 1 }}>{children}</main>
      </div>
    </SupabaseGuard>
  );
}
