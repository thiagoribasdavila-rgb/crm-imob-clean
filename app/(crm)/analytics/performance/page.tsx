import { redirect } from "next/navigation";
import { resolveAtlasNavigationAlias } from "@/lib/atlas/navigation-aliases";

export default function PerformanceAnalyticsPage() {
  redirect(resolveAtlasNavigationAlias("/analytics"));
}
