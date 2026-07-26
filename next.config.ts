import type { NextConfig } from "next";

/**
 * `unsafe-eval` SÓ em desenvolvimento.
 *
 * O React em modo dev usa `eval()` para reconstruir pilha de chamada e alimentar
 * o overlay de erro. Com a CSP de produção valendo também no `next dev`, o
 * console enche de "eval() is not supported in this environment" e o overlay
 * perde o rastreamento — quem for depurar um bug real vê o aviso da CSP no lugar
 * do erro que procurava.
 *
 * Em produção o React não usa eval, e aqui a diretiva não entra: a CSP servida
 * ao usuário final continua exatamente a mesma. Amarrado a NODE_ENV, e não a uma
 * variável nossa, para que não exista jeito de ligar isto num build publicado.
 */
const emDesenvolvimento = process.env.NODE_ENV === "development";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      `script-src 'self' 'unsafe-inline'${emDesenvolvimento ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "worker-src 'self' blob:",
      "upgrade-insecure-requests",
    ].join("; "),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Origin-Agent-Cluster", value: "?1" },
];

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  serverExternalPackages: ["@supabase/supabase-js"],
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
