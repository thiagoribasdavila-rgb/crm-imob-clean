import { expect, test } from "@playwright/test";

test("formulário público de acesso é claro, seguro e recuperável", async ({
  page,
}) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Bem-vindo." })).toBeVisible();
  await expect(page.getByLabel("E-mail corporativo")).toBeVisible();
  await expect(page.getByLabel("Senha")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Entrar no Atlas OS/i }),
  ).toBeEnabled();
  await expect(
    page.getByRole("link", { name: "Esqueci minha senha" }),
  ).toHaveAttribute("href", "/forgot-password");
});
