import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const expected = process.env.ATLAS_BOOTSTRAP_SECRET;
  const received = request.headers.get("x-atlas-bootstrap-secret");
  return Boolean(expected && received && expected === received);
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
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
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

    return NextResponse.json({
      status: "ok",
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
    return NextResponse.json({ error: "Falha no diagnóstico do bootstrap.", detail }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const rate = checkRateLimit(clientKey(request, "atlas-bootstrap-admin"), {
    limit: 5,
    windowMs: 15 * 60_000,
  });

  if (!rate.allowed) {
    return NextResponse.json(
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
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const admin = getSupabaseAdmin();
    const body = (await request.json()) as BootstrapPayload;
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";
    const fullName = body.fullName?.trim() || "Administrador Atlas";

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
    }

    if (password.length < 12) {
      return NextResponse.json(
        { error: "A senha inicial deve possuir pelo menos 12 caracteres." },
        { status: 400 },
      );
    }

    const { count: existingProfiles, error: profilesError } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true });

    if (profilesError) throw profilesError;
    if ((existingProfiles ?? 0) > 0) {
      return NextResponse.json(
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
      return NextResponse.json(
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
        role: "admin",
        organization_id: organizationId,
      },
    });

    if (authError) {
      const detail = safeError(authError);
      logger.error("atlas.bootstrap_auth_create_failed", detail);
      return NextResponse.json(
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

    return NextResponse.json(
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
    return NextResponse.json(
      { error: "Falha ao ativar o administrador inicial.", detail },
      { status: 500 },
    );
  }
}
