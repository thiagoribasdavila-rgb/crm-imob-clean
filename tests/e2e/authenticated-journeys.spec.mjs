import { expect, test } from "@playwright/test";

const TECHNICAL_ERROR_PATTERNS = [
  /Could not find/i,
  /does not exist/i,
  /schema cache/i,
  /column [a-z0-9_.]+/i,
  /usuário sem organização vinculada/i,
  /perfil comercial não identificado/i,
  /não foi possível carregar/i,
];

const coreRoutes = [
  "/dashboard",
  "/leads",
  "/pipeline",
  "/tasks",
  "/calendar",
  "/customers",
  "/developments",
];

const roles = [
  {
    label: "ADMIN",
    emailName: "ATLAS_E2E_ADMIN_EMAIL",
    passwordName: "ATLAS_E2E_ADMIN_PASSWORD",
    emailFallback: "ATLAS_TEST_EMAIL",
    passwordFallback: "ATLAS_TEST_PASSWORD",
    accepts(context) {
      return context.profile.accessRole === "admin";
    },
  },
  {
    label: "DIRETOR",
    emailName: "ATLAS_E2E_DIRECTOR_EMAIL",
    passwordName: "ATLAS_E2E_DIRECTOR_PASSWORD",
    accepts(context) {
      return (
        context.profile.commercialRole === "director" ||
        ["director", "director_decisor"].includes(context.profile.accessRole)
      );
    },
  },
  {
    label: "GERENTE",
    emailName: "ATLAS_E2E_MANAGER_EMAIL",
    passwordName: "ATLAS_E2E_MANAGER_PASSWORD",
    accepts(context) {
      return context.profile.commercialRole === "manager";
    },
  },
  {
    label: "CORRETOR",
    emailName: "ATLAS_E2E_BROKER_EMAIL",
    passwordName: "ATLAS_E2E_BROKER_PASSWORD",
    accepts(context) {
      return context.profile.commercialRole === "broker";
    },
  },
];

function credential(role, field) {
  const primary =
    field === "email" ? role.emailName : role.passwordName;
  const fallback =
    field === "email" ? role.emailFallback : role.passwordFallback;
  return process.env[primary] || (fallback ? process.env[fallback] : "");
}

async function assertNoTechnicalFailure(page) {
  const body = await page.locator("body").innerText();
  for (const pattern of TECHNICAL_ERROR_PATTERNS) {
    expect(body, `erro técnico visível em ${page.url()}: ${pattern}`).not.toMatch(
      pattern,
    );
  }
}

for (const role of roles) {
  test(`${role.label}: login, contexto e módulos centrais`, async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/login");
    await page.getByLabel("E-mail corporativo").fill(credential(role, "email"));
    await page.getByLabel("Senha").fill(credential(role, "password"));
    await page
      .getByRole("button", { name: /Entrar no Atlas OS/i })
      .click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 30_000,
    });

    const authResponse = await page.request.get("/api/v1/auth/me");
    expect(authResponse.ok()).toBeTruthy();
    const authPayload = await authResponse.json();
    expect(authPayload.ok).toBe(true);
    expect(authPayload.data.profile.active).toBe(true);
    expect(authPayload.data.organization.active).toBe(true);
    expect(role.accepts(authPayload.data)).toBe(true);

    for (const route of coreRoutes) {
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status() ?? 200, `${role.label} em ${route}`).toBeLessThan(
        500,
      );
      await expect(page.locator("body")).toBeVisible();
      await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
      await assertNoTechnicalFailure(page);
    }

    expect(pageErrors, `erros JavaScript para ${role.label}`).toEqual([]);
  });
}
