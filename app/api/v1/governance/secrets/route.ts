import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import environmentContract from "@/config/environment-variables.json";
import secretGovernance from "@/config/secret-governance.json";

export const dynamic = "force-dynamic";
const inventory = environmentContract.variables.filter((item) => item.scope !== "runtime");

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, scope: "secrets-governance" }); if (!rate.ok) return rate.response;
  const identity = await requireAccessContext(request); if (!identity.ok) return identity.response;
  if (!(identity.access.profile.role === "admin" || identity.access.profile.commercialRole === "director")) return apiError("FORBIDDEN", "Auditoria de segredos é exclusiva da diretoria.", identity.meta, { status: 403 });
  const variables = inventory.map((item) => ({ name: item.name, scope: item.scope, requirement: item.requirement, secret: item.secret, configured: Boolean(process.env[item.name]) }));
  const invalidPublicNames = inventory.filter((item) => item.scope === "server" && item.name.startsWith("NEXT_PUBLIC_"));
  const alternativeGroupsReady = Object.values(environmentContract.alternativeGroups).every((group) => group.members.filter((name) => Boolean(process.env[name])).length >= group.minimumConfigured);
  const secretPolicies = secretGovernance.profiles.map(({ key, ownerRole, rotationDays, revokeAfterUse, variables: names }) => ({ key, ownerRole, rotationDays, revokeAfterUse: Boolean(revokeAfterUse), coveredSecrets: names.length }));
  return apiSuccess({ policy: { valuesReturned: false, source: "config/environment-variables.json", governanceSource: "config/secret-governance.json", allowedPublicVariables: inventory.filter((item) => item.scope === "public").map((item) => item.name), approvedSecretStorage: secretGovernance.storage.approved, repositoryScanCommand: "npm run security:secrets" }, variables, secretPolicies, summary: { requiredReady: variables.filter((item) => item.requirement === "required").every((item) => item.configured) && alternativeGroupsReady, alternativeGroupsReady, temporaryConfigured: variables.filter((item) => item.requirement === "temporary" && item.configured).length, governedSecrets: secretGovernance.profiles.reduce((total, profile) => total + profile.variables.length, 0), serverSecretsExposedAsPublic: invalidPublicNames.length, environment: process.env.ATLAS_ENV || "unknown", hosting: process.env.ATLAS_HOSTING_PROVIDER === "hostinger" ? "hostinger" : "unconfirmed" } }, identity.meta, { headers: { ...rate.headers, "Cache-Control": "no-store" } });
}
