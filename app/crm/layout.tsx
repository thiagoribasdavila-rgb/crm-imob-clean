export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function CRMLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
