import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { bootstrapState } from "@/lib/bootstrap/policy";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

let bootstrapInProgress = false;

function bootstrapAllowed(): boolean {
  return process.env.ATLAS_ENV === "development" || process.env.ATLAS_ENV === "homologation";
}

function isAuthorized(request: Request): boolean {
  const expected = process.env.ATLAS_BOOTSTRAP_SECRET;
  const received = request.headers.get("x-atlas-bootstrap-secret");
  if (!bootstrapAllowed() || !expected || expected.length < 32 || !received) return false;
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}

function response(body: object, init?: ResponseInit) {
  const result = NextResponse.json(body, init);
  result.headers.set("Cache-Control", "no-store, max-age=0");
  return result;
}

function projectRefFromUrl(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

function safeError(error: unknown) {
  if (error && typeof error === "object") {
    const value = error as {
      name?: unknown;
      message?: unknown;
      status?: unknown;
      code?: unknown;
    };

    return {
      name: typeof value.name === "string" ? value.name : "Error",
      message: typeof value.message === "string" ? value.message : "Falha desconhecida.",
      status: typeof value.status === "number" ? value.status : null,
      code: typeof value.code === "string" ? value.code : null,
    };
  }

  return {
    name: "Error",
    message: typeof error === "string" ? error : "Falha desconhecida.",
    status: null,
    code: null,
  };
}

type BootstrapPayload = {
  email?: string;
  password?: string;
  fullName?: string;
  organizationId?: string;
  organizationName?: string;
  organizationSlug?: string;
};

function organizationSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
}

export async function GET(request: Request) {
  if (!bootstrapAllowed()) return response({ error: "Bootstrap indisponível neste ambiente." }, { status: 404 });
  const rate = checkRateLimit(clientKey(request, "atlas-bootstrap-diagnostic"), {
    limit: 20,
    windowMs: 15 * 60_000,
  });

  if (!rate.allowed) {
    return response(
      { error: "Muitas tentativas de diagnóstico." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))),
        },
      },
    );
  }
  if (!isAuthorized(request)) {
    return response({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const admin = getSupabaseAdmin();
    const [
      { count: organizationsCount, error: organizationsError },
      { count: profilesCount, error: profilesError },
    ] =
      await Promise.all([
        admin.from("organizations").select("id", { count: "exact", head: true }),
        admin.from("profiles").select("id", { count: "exact", head: true }),
      ]);

    if (organizationsError) throw organizationsError;
    if (profilesError) throw profilesError;

    return response({
      status: "ok",
      bootstrap: bootstrapState(profilesCount ?? 0),
      environment: {
        supabaseUrlConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        serviceRoleConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        bootstrapSecretConfigured: Boolean(process.env.ATLAS_BOOTSTRAP_SECRET),
        projectRef: projectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
      },
      database: {
        organizations: organizationsCount ?? 0,
        profiles: profilesCount ?? 0,
      },
    });
  } catch (error) {
    const detail = safeError(error);
    logger.error("atlas.bootstrap_diagnostic_failed", detail);
    return response({ error: "Falha no diagnóstico do bootstrap.", detail }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!bootstrapAllowed()) return response({ error: "Bootstrap indisponível neste ambiente." }, { status: 404 });
  const rate = checkRateLimit(clientKey(request, "atlas-bootstrap-admin"), {
    limit: 5,
    windowMs: 15 * 60_000,
  });

  if (!rate.allowed) {
    return response(
      { error: "Muitas tentativas de ativação." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))),
        },
      },
    );
  }

  if (!isAuthorized(request)) {
    return response({ error: "Não autorizado." }, { status: 401 });
  }

  if (bootstrapInProgress) return response({ error: "Ativação já está em andamento." }, { status: 409 });
  bootstrapInProgress = true;

  try {
    const admin = getSupabaseAdmin();
    const body = (await request.json()) as BootstrapPayload;
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";
    const fullName = body.fullName?.trim() || "Administrador Atlas";
    const requestedOrganizationName = body.organizationName?.trim();

    if (!email || !email.includes("@")) {
      return response({ error: "E-mail inválido." }, { status: 400 });
    }

    const passwordCategories = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((rule) => rule.test(password)).length;
    if (password.length < 12 || password.length > 128 || passwordCategories < 3) {
      return response(
        { error: "Use de 12 a 128 caracteres e combine ao menos três tipos de caractere." },
        { status: 400 },
      );
    }
    if (fullName.length > 120) return response({ error: "Nome excede 120 caracteres." }, { status: 400 });
    if (requestedOrganizationName && requestedOrganizationName.length > 120) {
      return response({ error: "Nome da organização excede 120 caracteres." }, { status: 400 });
    }

    const { count: existingProfiles, error: profilesError } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true });

    if (profilesError) throw profilesError;
    if (bootstrapState(existingProfiles ?? 0) === "locked") {
      return response(
        { error: "Bootstrap já concluído. Crie novos usuários pelo módulo administrativo." },
        { status: 409 },
      );
    }

    let organizationId = body.organizationId?.trim();
    let createdOrganizationId: string | null = null;
    if (!organizationId) {
      const { data: organizations, error: organizationError } = await admin
        .from("organizations")
        .select("id,name")
        .eq("active", true)
        .order("created_at", { ascending: true })
        .limit(2);

      if (organizationError) throw organizationError;
      if ((organizations?.length ?? 0) === 1) {
        organizationId = organizations![0].id;
      } else if ((organizations?.length ?? 0) > 1) {
        return response(
          { error: "Informe a organização que receberá o primeiro administrador." },
          { status: 409 },
        );
      } else {
        const name = requestedOrganizationName || "Atlas One";
        const slug = organizationSlug(body.organizationSlug?.trim() || name);
        if (slug.length < 3) {
          return response({ error: "Informe um nome válido para a organização." }, { status: 400 });
        }

        const { data: createdOrganization, error: createOrganizationError } = await admin
          .from("organizations")
          .insert({ name, slug, status: "ACTIVE" })
          .select("id")
          .single();

        if (createOrganizationError) throw createOrganizationError;
        organizationId = createdOrganization.id;
        createdOrganizationId = createdOrganization.id;
      }
    }

    if (!organizationId) return response({ error: "Não foi possível preparar a organização." }, { status: 409 });

    const userAttributes = {
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
      },
      app_metadata: {
        organization_id: organizationId,
        access_role: "admin",
        commercial_role: "director",
      },
    };
    const { data: authUsersPage, error: authUsersError } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (authUsersError) throw authUsersError;
    const precreatedAuthUser = authUsersPage.users.find(
      (candidate) => candidate.email?.trim().toLowerCase() === email,
    );
    let createdAuthUser = false;
    const { data: authData, error: authError } = precreatedAuthUser
      ? await admin.auth.admin.updateUserById(precreatedAuthUser.id, userAttributes)
      : await admin.auth.admin.createUser({
          email,
          ...userAttributes,
        });
    createdAuthUser = !precreatedAuthUser && !authError;

    if (authError) {
      if (createdOrganizationId) {
        await admin.from("organizations").delete().eq("id", createdOrganizationId);
      }
      const detail = safeError(authError);
      logger.error("atlas.bootstrap_auth_create_failed", detail);
      return response(
        {
          error: "O Supabase Auth recusou a criação do usuário.",
          detail,
          projectRef: projectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
        },
        { status: detail.status && detail.status >= 400 ? detail.status : 502 },
      );
    }

    const userId = authData.user?.id;
    if (!userId) throw new Error("Usuário não foi criado pelo provedor de identidade.");

    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: userId,
        organization_id: organizationId,
        full_name: fullName,
        name: fullName,
        email,
        role: "admin",
        access_role: "admin",
        commercial_role: "director",
        reports_to: null,
        active: true,
      },
      { onConflict: "id" },
    );

    if (profileError) {
      if (createdAuthUser) await admin.auth.admin.deleteUser(userId);
      if (createdOrganizationId) {
        await admin.from("organizations").delete().eq("id", createdOrganizationId);
      }
      throw profileError;
    }

    logger.info("atlas.bootstrap_admin_created", {
      userId,
      organizationId,
      emailDomain: email.split("@")[1],
    });

    return response(
      {
        status: "created",
        userId,
        organizationId,
        message: "Administrador inicial criado. Remova ATLAS_BOOTSTRAP_SECRET após o primeiro acesso.",
      },
      { status: 201 },
    );
  } catch (error) {
    const detail = safeError(error);
    logger.error("atlas.bootstrap_admin_failed", detail);
    return response(
      { error: "Falha ao ativar o administrador inicial.", detail },
      { status: 500 },
    );
  } finally {
    bootstrapInProgress = false;
  }
}
