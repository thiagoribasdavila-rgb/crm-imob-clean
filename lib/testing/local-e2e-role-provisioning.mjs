import { ISOLATED_E2E_ENV } from "./isolated-e2e-readiness.mjs";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const FORBIDDEN_PROJECT_REF = "pozbrcsfthnhmnebfoxv";
const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000176";

export const LOCAL_E2E_PROVISIONER_ENV =
  "ATLAS_E2E_LOCAL_PROVISIONER_SERVICE_ROLE_KEY";

const ROLE_DEFINITIONS = Object.freeze([
  {
    key: "ADMIN",
    emailName: ISOLATED_E2E_ENV.adminEmail,
    passwordName: ISOLATED_E2E_ENV.adminPassword,
    fullName: "Administrador E2E local",
    legacyRole: "admin",
    accessRole: "admin",
    commercialRole: "director",
    reportsTo: null,
  },
  {
    key: "DIRETOR",
    emailName: ISOLATED_E2E_ENV.directorEmail,
    passwordName: ISOLATED_E2E_ENV.directorPassword,
    fullName: "Diretor E2E local",
    legacyRole: "admin",
    accessRole: "director_decisor",
    commercialRole: "director",
    reportsTo: null,
  },
  {
    key: "GERENTE",
    emailName: ISOLATED_E2E_ENV.managerEmail,
    passwordName: ISOLATED_E2E_ENV.managerPassword,
    fullName: "Gerente E2E local",
    legacyRole: "manager",
    accessRole: "director",
    commercialRole: "manager",
    reportsTo: "DIRETOR",
  },
  {
    key: "CORRETOR",
    emailName: ISOLATED_E2E_ENV.brokerEmail,
    passwordName: ISOLATED_E2E_ENV.brokerPassword,
    fullName: "Corretor E2E local",
    legacyRole: "broker",
    accessRole: "broker",
    commercialRole: "broker",
    reportsTo: "GERENTE",
  },
]);

function normalized(value) {
  return value?.trim().toLowerCase() ?? "";
}

function assertLoopbackSupabaseUrl(value, errors) {
  try {
    const parsed = new URL(value);
    if (!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
      errors.push("Supabase do provisionador deve apontar exclusivamente para loopback local");
    }
    if (value.includes(FORBIDDEN_PROJECT_REF) || parsed.hostname.endsWith("supabase.co")) {
      errors.push("projeto Supabase operacional é proibido no provisionador local");
    }
  } catch {
    errors.push("URL do Supabase local é inválida");
  }
}

export function evaluateLocalE2EProvisionerEnvironment(values) {
  const required = [
    ISOLATED_E2E_ENV.supabaseUrl,
    LOCAL_E2E_PROVISIONER_ENV,
    ...ROLE_DEFINITIONS.flatMap(({ emailName, passwordName }) => [
      emailName,
      passwordName,
    ]),
  ];
  const missing = required.filter((name) => !values[name]?.trim());
  const errors = missing.map((name) => `${name} ausente`);

  if (values[ISOLATED_E2E_ENV.supabaseUrl]) {
    assertLoopbackSupabaseUrl(values[ISOLATED_E2E_ENV.supabaseUrl], errors);
  }
  if (values.ATLAS_E2E_ISOLATED_SERVICE_ROLE_KEY?.trim()) {
    errors.push("ATLAS_E2E_ISOLATED_SERVICE_ROLE_KEY é proibida");
  }

  const emails = ROLE_DEFINITIONS.map(({ emailName }) => normalized(values[emailName])).filter(Boolean);
  if (new Set(emails).size !== emails.length) {
    errors.push("cada papel precisa utilizar um e-mail local distinto");
  }
  for (const { passwordName } of ROLE_DEFINITIONS) {
    const password = values[passwordName]?.trim();
    if (password && password.length < 12) {
      errors.push(`${passwordName} deve possuir ao menos 12 caracteres`);
    }
  }

  return {
    ready: errors.length === 0,
    missing,
    errors,
    localOnly: true,
    roleCount: ROLE_DEFINITIONS.length,
    secretValuesReturned: false,
  };
}

export function buildLocalE2ERoleProvisioningPlan() {
  return {
    schemaVersion: 1,
    organization: {
      id: ORGANIZATION_ID,
      name: "Atlas E2E Local",
      slug: "atlas-e2e-local",
      status: "ACTIVE",
    },
    roles: ROLE_DEFINITIONS.map((role) => ({
      key: role.key,
      emailVariable: role.emailName,
      passwordVariable: role.passwordName,
      accessRole: role.accessRole,
      commercialRole: role.commercialRole,
      reportsTo: role.reportsTo,
    })),
    provisionerKeyVariable: LOCAL_E2E_PROVISIONER_ENV,
    secretsIncluded: false,
  };
}

function throwIfError(result, operation) {
  if (result?.error) {
    throw new Error(`${operation}: ${result.error.message ?? "falha no Supabase local"}`);
  }
  return result?.data;
}

export function createSupabaseLocalProvisioningGateway(client) {
  return {
    async upsertOrganization(organization) {
      return throwIfError(
        await client.from("organizations").upsert(organization, { onConflict: "id" }),
        "upsert da organização local",
      );
    },
    async listUsers() {
      const users = [];
      let page = 1;
      while (true) {
        const data = throwIfError(
          await client.auth.admin.listUsers({ page, perPage: 100 }),
          "listagem dos usuários locais",
        );
        users.push(...(data?.users ?? []));
        if ((data?.users?.length ?? 0) < 100) break;
        page++;
      }
      return users;
    },
    async createUser(attributes) {
      const data = throwIfError(
        await client.auth.admin.createUser(attributes),
        "criação de usuário E2E local",
      );
      return data.user;
    },
    async updateUser(userId, attributes) {
      const data = throwIfError(
        await client.auth.admin.updateUserById(userId, attributes),
        "atualização de usuário E2E local",
      );
      return data.user;
    },
    async upsertProfile(profile) {
      return throwIfError(
        await client.from("profiles").upsert(profile, { onConflict: "id" }),
        "upsert de perfil E2E local",
      );
    },
  };
}

export async function provisionLocalE2ERoles({ gateway, values }) {
  const assessment = evaluateLocalE2EProvisionerEnvironment(values);
  if (!assessment.ready) {
    throw new Error(`provisionamento local recusado: ${assessment.errors.join("; ")}`);
  }

  const plan = buildLocalE2ERoleProvisioningPlan();
  await gateway.upsertOrganization(plan.organization);
  const existingUsers = await gateway.listUsers();
  const usersByEmail = new Map(
    existingUsers.filter((user) => user.email).map((user) => [normalized(user.email), user]),
  );
  const resolved = new Map();
  let created = 0;
  let updated = 0;

  for (const role of ROLE_DEFINITIONS) {
    const email = normalized(values[role.emailName]);
    const attributes = {
      email,
      password: values[role.passwordName],
      email_confirm: true,
      app_metadata: {
        organization_id: ORGANIZATION_ID,
        role: role.accessRole,
        access_role: role.accessRole,
        commercial_role: role.commercialRole,
      },
      user_metadata: { full_name: role.fullName },
    };
    const current = usersByEmail.get(email);
    const user = current
      ? await gateway.updateUser(current.id, attributes)
      : await gateway.createUser(attributes);
    if (!user?.id) throw new Error(`usuário ${role.key} não retornou identificador local`);
    if (current) {
      updated += 1;
    } else {
      created += 1;
    }
    resolved.set(role.key, user.id);
  }

  for (const role of ROLE_DEFINITIONS) {
    const id = resolved.get(role.key);
    await gateway.upsertProfile({
      id,
      organization_id: ORGANIZATION_ID,
      full_name: role.fullName,
      name: role.fullName,
      email: normalized(values[role.emailName]),
      role: role.legacyRole,
      access_role: role.accessRole,
      commercial_role: role.commercialRole,
      reports_to: role.reportsTo ? resolved.get(role.reportsTo) : null,
      active: true,
      updated_at: new Date().toISOString(),
    });
  }

  return {
    organizationProvisioned: true,
    rolesProvisioned: ROLE_DEFINITIONS.map(({ key }) => key),
    created,
    updated,
    hierarchy: ["DIRETOR>GERENTE", "GERENTE>CORRETOR"],
    secretsReturned: false,
  };
}

export const LOCAL_E2E_ORGANIZATION_ID = ORGANIZATION_ID;
