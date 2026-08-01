import { redirect } from "next/navigation";
import { resolveAtlasNavigationAlias } from "@/lib/atlas/navigation-aliases";

export default function MarketingAnalyticsPage() {
  redirect(resolveAtlasNavigationAlias("/analytics"));
}
