import { redirect } from "next/navigation";

export default async function DevelopmentMaterialsRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/developments/materials?project=${encodeURIComponent(id)}`);
}
