# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: login.spec.mjs >> formulário público de acesso é claro, seguro e recuperável
- Location: tests/e2e/login.spec.mjs:3:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Bem-vindo.' })
Expected: visible
Timeout: 12000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 12000ms
  - waiting for getByRole('heading', { name: 'Bem-vindo.' })

```

```yaml
- main:
  - paragraph: Recuperação segura
  - heading "O Atlas encontrou uma inconsistência" [level=1]
  - paragraph: Seus dados permanecem protegidos. Tente recuperar a tela; se a falha continuar, volte ao acesso e registre o horário do ocorrido.
  - button "Tentar novamente"
  - link "Voltar ao acesso":
    - /url: /login
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | 
  3  | test("formulário público de acesso é claro, seguro e recuperável", async ({
  4  |   page,
  5  | }) => {
  6  |   await page.goto("/login");
  7  | 
> 8  |   await expect(page.getByRole("heading", { name: "Bem-vindo." })).toBeVisible();
     |                                                                   ^ Error: expect(locator).toBeVisible() failed
  9  |   await expect(page.getByLabel("E-mail corporativo")).toBeVisible();
  10 |   await expect(page.getByLabel("Senha")).toBeVisible();
  11 |   await expect(
  12 |     page.getByRole("button", { name: /Entrar no Atlas OS/i }),
  13 |   ).toBeEnabled();
  14 |   await expect(
  15 |     page.getByRole("link", { name: "Esqueci minha senha" }),
  16 |   ).toHaveAttribute("href", "/forgot-password");
  17 | });
  18 | 
```