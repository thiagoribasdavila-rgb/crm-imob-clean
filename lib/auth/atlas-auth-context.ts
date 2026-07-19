"use client";

export type AtlasAccessRole = "admin" | "director_decisor" | "director" | "broker";

export type AtlasAuthContext = {
  user: {
    id: string;
    email: string | null;
    emailConfirmed: boolean;
  };
  profile: {
    id: string;
    name: string;
    organizationId: string;
    role: string;
    accessRole: AtlasAccessRole;
    commercialRole: "director" | "superintendent" | "manager" | "broker" | null;
    reportsTo: string | null;
    active: boolean;
  };
  organization: {
    id: string;
    name: string;
    slug: string | null;
    plan: string | null;
    active: boolean;
  };
};

export type AtlasAuthFailure = {
  code: string;
  message: string;
};

export const ATLAS_AUTH_CONTEXT_KEY = "atlas:auth-context";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAccessRole(value: unknown): value is AtlasAccessRole {
  return ["admin", "director_decisor", "director", "broker"].includes(String(value));
}

export function parseAtlasAuthContext(payload: unknown): AtlasAuthContext | null {
  if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.data)) return null;
  const { user, profile, organization } = payload.data;
  if (!isRecord(user) || !isRecord(profile) || !isRecord(organization)) return null;
  if (
    typeof user.id !== "string"
    || typeof profile.id !== "string"
    || typeof profile.name !== "string"
    || typeof profile.organizationId !== "string"
    || typeof profile.role !== "string"
    || !isAccessRole(profile.accessRole)
    || profile.active !== true
    || typeof organization.id !== "string"
    || typeof organization.name !== "string"
    || organization.active !== true
  ) return null;

  const commercialRole = ["director", "superintendent", "manager", "broker"].includes(String(profile.commercialRole))
    ? profile.commercialRole as AtlasAuthContext["profile"]["commercialRole"]
    : null;

  return {
    user: {
      id: user.id,
      email: typeof user.email === "string" ? user.email : null,
      emailConfirmed: user.emailConfirmed === true,
    },
    profile: {
      id: profile.id,
      name: profile.name,
      organizationId: profile.organizationId,
      role: profile.role,
      accessRole: profile.accessRole,
      commercialRole,
      reportsTo: typeof profile.reportsTo === "string" ? profile.reportsTo : null,
      active: true,
    },
    organization: {
      id: organization.id,
      name: organization.name,
      slug: typeof organization.slug === "string" ? organization.slug : null,
      plan: typeof organization.plan === "string" ? organization.plan : null,
      active: true,
    },
  };
}

export function parseAtlasAuthFailure(payload: unknown): AtlasAuthFailure | null {
  if (!isRecord(payload) || payload.ok !== false || !isRecord(payload.error)) return null;
  if (typeof payload.error.code !== "string" || typeof payload.error.message !== "string") return null;
  return { code: payload.error.code, message: payload.error.message };
}

export function readAtlasAuthContext(): AtlasAuthContext | null {
  if (typeof window === "undefined") return null;
  const cached = window.sessionStorage.getItem(ATLAS_AUTH_CONTEXT_KEY);
  if (!cached) return null;
  try {
    return parseAtlasAuthContext({ ok: true, data: JSON.parse(cached) });
  } catch {
    window.sessionStorage.removeItem(ATLAS_AUTH_CONTEXT_KEY);
    return null;
  }
}

export function storeAtlasAuthContext(context: AtlasAuthContext) {
  window.sessionStorage.setItem(ATLAS_AUTH_CONTEXT_KEY, JSON.stringify(context));
}

export function clearAtlasAuthContext() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(ATLAS_AUTH_CONTEXT_KEY);
  window.sessionStorage.removeItem("atlas:shell-identity");
}

export async function fetchAtlasAuthContext(signal?: AbortSignal) {
  const response = await fetch("/api/v1/auth/me", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  const context = parseAtlasAuthContext(payload);
  if (context) storeAtlasAuthContext(context);
  return {
    response,
    context,
    failure: parseAtlasAuthFailure(payload),
  };
}

export function authContextToShellIdentity(context: AtlasAuthContext) {
  const commercialRole = context.profile.commercialRole || context.profile.role;
  const role = ["director", "superintendent", "manager", "broker"].includes(commercialRole)
    ? commercialRole
    : context.profile.accessRole === "broker" ? "broker" : "director";
  return {
    name: context.profile.name,
    email: context.user.email || "",
    organization: context.organization.name,
    role,
    accessRole: context.profile.accessRole,
  };
}
