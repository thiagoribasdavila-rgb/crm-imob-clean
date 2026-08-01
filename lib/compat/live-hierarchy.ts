import { LIVE_PROFILE_SELECT, mapLegacyProfile, type CompatRow } from "@/lib/compat/legacy-v2";

export { LIVE_PROFILE_SELECT };

export function resolveLiveHierarchy(rows: CompatRow[]) {
  const profiles = rows.map((row) => mapLegacyProfile(row));
  const directors = profiles.filter((profile) => profile.commercial_role === "director");
  const superintendents = profiles.filter((profile) => profile.commercial_role === "superintendent");
  const managers = profiles.filter((profile) => profile.commercial_role === "manager");
  const preferredDirector = directors.find((profile) => String(profile.role).toLocaleUpperCase("pt-BR") === "DIRETOR") || directors[0];

  return profiles.map((profile) => {
    if (profile.reports_to) return profile;
    if (profile.commercial_role === "broker") return { ...profile, reports_to: managers[0]?.id ?? superintendents[0]?.id ?? preferredDirector?.id ?? null, hierarchy_source: "derived-live-profile" };
    if (profile.commercial_role === "manager") return { ...profile, reports_to: superintendents[0]?.id ?? preferredDirector?.id ?? null, hierarchy_source: "derived-live-profile" };
    if (profile.commercial_role === "superintendent") return { ...profile, reports_to: preferredDirector?.id ?? null, hierarchy_source: "derived-live-profile" };
    return { ...profile, reports_to: null, hierarchy_source: "live-profile" };
  });
}

export function descendantsFromLiveProfiles(profiles: CompatRow[], root: string) {
  const allowed = new Set([root]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const profile of profiles) {
      const id = String(profile.id || "");
      const reportsTo = String(profile.reports_to || "");
      if (id && reportsTo && allowed.has(reportsTo) && !allowed.has(id)) {
        allowed.add(id);
        changed = true;
      }
    }
  }
  return allowed;
}

export function liveStorageRole(role: string) {
  const normalized = role.toLocaleLowerCase("pt-BR");
  if (normalized === "director") return "DIRETOR";
  if (normalized === "superintendent") return "SUPERINTENDENTE";
  if (normalized === "manager") return "GERENTE";
  return "CORRETOR";
}
