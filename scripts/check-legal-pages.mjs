/**
 * Teste adversarial das PÁGINAS LEGAIS PÚBLICAS (/privacy, /terms, /data-deletion).
 *
 * Essas três URLs são exigidas pelo App Review da Meta: o revisor e o rastreador as
 * abrem ANONIMAMENTE. O modo de falha real e silencioso é alguém mexer no `proxy.ts`
 * (refatorar a lista de rotas públicas, trocar por prefixo, renomear a Set) e as
 * páginas voltarem a redirecionar para /login — o app continua compilando, os testes
 * continuam verdes, e a revisão da Meta é reprovada sem ninguém perceber.
 *
 * Estratégia (100% determinístico: só leitura de arquivo e simulação da própria
 * lógica do proxy — sem rede, sem servidor, sem banco, sem relógio, sem aleatório):
 *  - extrai a Set `publicPages` REAL do proxy.ts e SIMULA a decisão `isProtected`;
 *  - confere que o matcher do middleware alcança essas rotas (se não alcançar, a
 *    proteção nunca roda — precisa ser consciente, não acidente);
 *  - confere que cada página existe, é pública (sem "use client" desnecessário),
 *    declara canonical no domínio público e não colide com outra rota;
 *  - confere que a landing linka as três (a Meta exige que sejam alcançáveis);
 *  - confere o contato de privacidade nas páginas que prometem resposta.
 *
 * Rodar da raiz do repo: node scripts/check-legal-pages.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const failures = [];
let passed = 0;
function check(name, condition, extra = "") {
  if (condition) {
    passed += 1;
    console.log(`✅ ${name}`);
  } else {
    failures.push(`${name}${extra ? ` — ${extra}` : ""}`);
    console.log(`❌ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

const PUBLIC_ORIGIN = "https://atlasaios.com.br";
const PRIVACY_CONTACT = "privacidade@atlasaios.com.br";

/** As três rotas exigidas pela Meta, com o arquivo que deve servi-las. */
const LEGAL_ROUTES = [
  { route: "/privacy", file: "app/privacy/page.tsx", titulo: "Política de Privacidade", exigeContato: true },
  { route: "/terms", file: "app/terms/page.tsx", titulo: "Termos de Uso", exigeContato: false },
  { route: "/data-deletion", file: "app/data-deletion/page.tsx", titulo: "Exclusão de dados", exigeContato: true },
];

const read = (rel) => {
  const abs = path.join(root, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
};

/** O link pode estar em JSX (`href="/x"`) ou numa lista de dados (`href: "/x"`). */
const linka = (src, route) => src.includes(`href="${route}"`) || src.includes(`href: "${route}"`);

// --------------------------------------------------------------------------
// Bloco 1 — o proxy realmente deixa passar? (simulação da lógica real)
// --------------------------------------------------------------------------
const proxySrc = read("proxy.ts");
check("caso 1: proxy.ts existe", proxySrc !== null);

let publicPages = null;
let matcherSrc = null;

if (proxySrc) {
  const setMatch = proxySrc.match(/const\s+publicPages\s*=\s*new\s+Set\(\s*\[([\s\S]*?)\]\s*\)/);
  check("caso 2: proxy.ts declara a Set publicPages", Boolean(setMatch), setMatch ? "" : "não encontrei `new Set([...])`");

  if (setMatch) {
    publicPages = new Set(
      setMatch[1]
        .split(",")
        .map((s) => s.trim().replace(/^["'`]|["'`]$/g, ""))
        .filter((s) => s.startsWith("/")),
    );
    check("caso 3: a Set foi lida com rotas válidas", publicPages.size >= 5, `${publicPages.size} rotas lidas`);
  }

  const matcherMatch = proxySrc.match(/matcher:\s*\[\s*["'`]([\s\S]*?)["'`]\s*\]/);
  matcherSrc = matcherMatch ? matcherMatch[1] : null;
  check("caso 4: proxy.ts declara o matcher do middleware", Boolean(matcherSrc));

  // A decisão real do proxy é literalmente esta linha do produto:
  //   const isProtected = !publicPages.has(pathname);
  const isProtected = (pathname) => !publicPages?.has(pathname);

  for (const { route } of LEGAL_ROUTES) {
    check(
      `caso 5.${route}: simulação do proxy NÃO protege ${route} (não redireciona para /login)`,
      publicPages ? isProtected(route) === false : false,
      publicPages && isProtected(route) ? "rota ausente de publicPages: o revisor da Meta cai no login" : "",
    );
  }

  // Contraprova: se tudo virasse público, o teste acima passaria por acidente.
  for (const protegida of ["/dashboard", "/leads", "/marketing", "/settings"]) {
    check(
      `caso 6.${protegida}: contraprova — ${protegida} continua protegida`,
      publicPages ? isProtected(protegida) === true : false,
      "rota interna virou pública",
    );
  }

  // O matcher precisa ALCANÇAR as rotas legais; se não alcançar, elas ficam públicas
  // por acidente (e a proteção some junto numa futura mudança da Set).
  if (matcherSrc) {
    // O Next ancora o matcher no caminho inteiro; sem ^...$ o teste daria falso
    // positivo (`/api/leads` casaria a partir do segundo caractere).
    let re = null;
    try {
      re = new RegExp(`^${matcherSrc.replace(/\\\\/g, "\\")}$`);
    } catch {
      re = null;
    }
    check("caso 7: o matcher compila como regex", re !== null, matcherSrc);
    if (re) {
      for (const { route } of LEGAL_ROUTES) {
        check(`caso 8.${route}: o middleware é executado em ${route}`, re.test(route), "matcher não alcança a rota");
      }
      check("caso 9: o middleware NÃO roda em /api (evita redirecionar API)", re.test("/api/leads") === false);
    }
  }
}

// --------------------------------------------------------------------------
// Bloco 2 — as páginas existem, são únicas e apontam para o domínio público
// --------------------------------------------------------------------------
for (const { route, file, titulo, exigeContato } of LEGAL_ROUTES) {
  const src = read(file);
  check(`caso 10.${route}: ${file} existe`, src !== null);
  if (!src) continue;

  check(`caso 11.${route}: exporta componente default`, /export\s+default\s+function\s+\w+/.test(src));

  check(
    `caso 12.${route}: exporta metadata com título "${titulo}"`,
    /export\s+const\s+metadata\s*:\s*Metadata/.test(src) && src.includes(titulo),
  );

  const canonical = `${PUBLIC_ORIGIN}${route}`;
  check(
    `caso 13.${route}: canonical aponta para ${canonical}`,
    src.includes(canonical),
    "canonical errado quebra a validação de URL na Meta",
  );

  check(
    `caso 14.${route}: é Server Component (sem "use client")`,
    /^\s*["']use client["']/m.test(src) === false,
    "página legal não precisa de JS no cliente para ser lida pelo rastreador",
  );

  check(`caso 15.${route}: usa o shell público compartilhado`, src.includes("PublicPageShell"));

  if (exigeContato) {
    check(
      `caso 16.${route}: informa o contato de privacidade (${PRIVACY_CONTACT})`,
      src.includes(PRIVACY_CONTACT),
      "sem contato o titular não consegue exercer o direito prometido",
    );
  }
}

// --------------------------------------------------------------------------
// Bloco 3 — colisão de rota (duas páginas servindo a mesma URL)
// --------------------------------------------------------------------------
{
  const appDir = path.join(root, "app");
  /** Caminho de URL de um page.tsx: remove grupos (grupo) e o /page.tsx final. */
  const urlDeArquivo = (rel) =>
    "/" +
    rel
      .replace(/\\/g, "/")
      .replace(/^app\//, "")
      .replace(/\/page\.tsx$/, "")
      .split("/")
      .filter((seg) => seg && !(seg.startsWith("(") && seg.endsWith(")")))
      .join("/");

  const paginas = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        walk(abs);
      } else if (entry.name === "page.tsx") {
        paginas.push(path.relative(root, abs));
      }
    }
  };
  if (fs.existsSync(appDir)) walk(appDir);

  for (const { route } of LEGAL_ROUTES) {
    const donos = paginas.filter((p) => urlDeArquivo(p) === route);
    check(
      `caso 17.${route}: exatamente 1 arquivo serve ${route}`,
      donos.length === 1,
      donos.length === 0 ? "nenhum arquivo serve a rota" : `colisão: ${donos.join(" e ")}`,
    );
  }
}

// --------------------------------------------------------------------------
// Bloco 4 — as páginas são alcançáveis a partir da landing
// --------------------------------------------------------------------------
{
  const landing = read("app/page.tsx");
  check("caso 18: app/page.tsx (landing) existe", landing !== null);
  if (landing) {
    for (const { route } of LEGAL_ROUTES) {
      check(
        `caso 19.${route}: a landing linka ${route}`,
        linka(landing, route),
        "a Meta exige que as políticas sejam alcançáveis a partir do site",
      );
    }
  }

  const shell = read("components/public/PublicPageShell.tsx");
  check("caso 20: components/public/PublicPageShell.tsx existe", shell !== null);
  if (shell) {
    for (const { route } of LEGAL_ROUTES) {
      check(`caso 21.${route}: o rodapé público linka ${route}`, linka(shell, route));
    }
  }
}

// --------------------------------------------------------------------------
console.log("");
console.log(`check-legal-pages: ${passed} passaram, ${failures.length} falharam`);
if (failures.length) {
  for (const f of failures) console.error(`  FALHOU: ${f}`);
  process.exit(1);
}
