import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const commercialRoles = new Set(["director", "superintendent", "manager", "broker"]);
const expectedParent = { director: null, superintendent: "director", manager: "superintendent", broker: "manager" };

const { data: profiles, error: profileError } = await client
  .from("profiles")
  .select("id,organization_id,role,commercial_role,reports_to,active")
  .limit(10000);

if (profileError) {
  console.error("ATLAS AUTH + HIERARCHY RUNTIME AUDIT: BLOCKED");
  console.error(`A tabela profiles ainda não possui o contrato V3 (${profileError.code || "unknown"}).`);
  console.error("Aplique as migrations e execute primeiro: npm run audit:runtime-schema");
  process.exit(1);
}

const authUsers = [];
for (let page = 1; ; page += 1) {
  const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  const batch = data?.users ?? [];
  authUsers.push(...batch);
  if (batch.length < 1000) break;
}

const profileRows = profiles ?? [];
const profileById = new Map(profileRows.map((profile) => [profile.id, profile]));
const authIds = new Set(authUsers.map((user) => user.id));
const roleCounts = Object.fromEntries(["director", "superintendent", "manager", "broker", "unclassified"].map((role) => [role, 0]));
const violations = {
  invalidCommercialRole: 0,
  directorWithSupervisor: 0,
  missingSupervisor: 0,
  supervisorNotFound: 0,
  supervisorInOtherOrganization: 0,
  wrongSupervisorRole: 0,
  inactiveSupervisorForActiveProfile: 0,
};

function resolvedRole(profile) {
  if (commercialRoles.has(profile.commercial_role)) return profile.commercial_role;
  if (profile.role === "admin") return "director";
  if (commercialRoles.has(profile.role)) return profile.role;
  return null;
}

for (const profile of profileRows) {
  const role = resolvedRole(profile);
  roleCounts[role ?? "unclassified"] += 1;
  if (!role) {
    violations.invalidCommercialRole += 1;
    continue;
  }
  const required = expectedParent[role];
  if (!required) {
    if (profile.reports_to) violations.directorWithSupervisor += 1;
    continue;
  }
  if (!profile.reports_to) {
    violations.missingSupervisor += 1;
    continue;
  }
  const supervisor = profileById.get(profile.reports_to);
  if (!supervisor) {
    violations.supervisorNotFound += 1;
    continue;
  }
  if (supervisor.organization_id !== profile.organization_id) violations.supervisorInOtherOrganization += 1;
  if (resolvedRole(supervisor) !== required) violations.wrongSupervisorRole += 1;
  if (profile.active && !supervisor.active) violations.inactiveSupervisorForActiveProfile += 1;
}

const result = {
  authUsers: authUsers.length,
  profiles: profileRows.length,
  activeProfiles: profileRows.filter((profile) => profile.active).length,
  disabledProfiles: profileRows.filter((profile) => !profile.active).length,
  authUsersWithoutProfile: authUsers.filter((user) => !profileById.has(user.id)).length,
  profilesWithoutAuthUser: profileRows.filter((profile) => !authIds.has(profile.id)).length,
  roleCounts,
  hierarchyViolations: violations,
  mutatingActionsPerformed: 0,
};

console.log("ATLAS AUTH + HIERARCHY RUNTIME AUDIT");
console.log(JSON.stringify(result, null, 2));
const totalViolations = Object.values(violations).reduce((total, value) => total + value, 0);
if (result.authUsersWithoutProfile || result.profilesWithoutAuthUser || totalViolations) {
  console.error("Resultado: REVISÃO NECESSÁRIA. Nenhuma conta ou perfil foi alterado.");
  process.exit(1);
}
console.log("Resultado: PRONTO. Contas e hierarquia estão consistentes; nenhuma alteração foi executada.");
