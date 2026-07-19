import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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
};

export async function GET(request: Request) {
  if (!bootstrapAllowed()) return response({ error: "Bootstrap indisponível neste ambiente." }, { status: 404 });
  if (!isAuthorized(request)) {
    return response({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const admin = getSupabaseAdmin();
    const [{ count: usersCount, error: usersError }, { count: profilesCount, error: profilesError }] =
      await Promise.all([
        admin.from("organizations").select("id", { count: "exact", head: true }),
        admin.from("profiles").select("id", { count: "exact", head: true }),
      ]);

    if (usersError) throw usersError;
    if (profilesError) throw profilesError;

    return response({
      status: "ok",
      bootstrap: profilesCount === 0 ? "available" : "locked",
      environment: {
        supabaseUrlConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        serviceRoleConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        bootstrapSecretConfigured: Boolean(process.env.ATLAS_BOOTSTRAP_SECRET),
        projectRef: projectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
      },
      database: {
        organizations: usersCount ?? 0,
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

    const { count: existingProfiles, error: profilesError } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true });

    if (profilesError) throw profilesError;
    if ((existingProfiles ?? 0) > 0) {
      return response(
        { error: "Bootstrap já concluído. Crie novos usuários pelo módulo administrativo." },
        { status: 409 },
      );
    }

    let organizationId = body.organizationId?.trim();
    if (!organizationId) {
      const { data: organization, error: organizationError } = await admin
        .from("organizations")
        .select("id")
        .eq("active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (organizationError) throw organizationError;
      organizationId = organization?.id;
    }

    if (!organizationId) {
      return response(
        { error: "Nenhuma organização ativa foi encontrada." },
        { status: 409 },
      );
    }

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
      },
    });

    if (authError) {
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
        role: "admin",
        active: true,
      },
      { onConflict: "id" },
    );

    if (profileError) {
      await admin.auth.admin.deleteUser(userId);
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
