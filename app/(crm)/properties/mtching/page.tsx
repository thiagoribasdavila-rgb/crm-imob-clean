import { redirect } from "next/navigation";

export default function LegacyPropertyMatchingRedirect() {
  redirect("/properties/matching");
}
