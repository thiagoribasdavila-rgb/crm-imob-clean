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
  /**
   * ── A PROCEDÊNCIA DO BUILD, ASSADA NO BUNDLE ──────────────────────────────
   *
   * `scripts/build.mjs` descobre commit, branch e horário e os coloca em
   * `process.env` ANTES de chamar o `next build`. Este bloco é o que faz esses
   * valores sobreviverem: numa rota de servidor, `process.env.X` é lido em tempo
   * de EXECUÇÃO, do ambiente do servidor — que não conhece o build. Sem `env`
   * aqui, o campo nasceria sempre nulo em produção e a rota diria "não
   * declarado" para sempre.
   *
   * Por que isto importa: em 2026-07-30 foi preciso deduzir a versão em produção
   * pela AUSÊNCIA de uma chave na resposta. A pergunta "a produção roda o código
   * que eu auditei?" precisa de resposta direta — correção publicada no git e
   * ausente no servidor é correção que não existe.
   *
   * Só entram SHA, branch e horário. Nenhum segredo: são públicos por natureza,
   * e `security:secrets` continua valendo sobre este arquivo.
   */
  env: {
    ATLAS_BUILD_COMMIT: process.env.ATLAS_BUILD_COMMIT ?? "",
    ATLAS_BUILD_BRANCH: process.env.ATLAS_BUILD_BRANCH ?? "",
    ATLAS_BUILD_TIME: process.env.ATLAS_BUILD_TIME ?? "",
    // Esta faltava. O `build.mjs` calculava o topo das migrations e o punha em
    // process.env, mas sem a linha abaixo o valor morria no build: a rota
    // recebia null e dizia "não dá para comparar" para sempre. Só apareceu ao
    // rodar um build de verdade e conferir a resposta do servidor construído —
    // ler o código dos dois arquivos não teria mostrado a lacuna entre eles.
    ATLAS_BUILD_MIGRATIONS: process.env.ATLAS_BUILD_MIGRATIONS ?? "",
    ATLAS_BUILD_DEPLOY_ID: process.env.ATLAS_BUILD_DEPLOY_ID ?? "",
  },
  /**
   * ── A ROTA COM ERRO DE DIGITAÇÃO ────────────────────────────────────────
   *
   * `app/(crm)/properties/mtching` esteve no ar com o nome errado, e cinco
   * lugares do produto apontavam para ele: a tela de imóveis, o painel de IA,
   * duas linhas do roteiro de homologação e o catálogo de evolução.
   *
   * O diretório foi renomeado para `matching` e as cinco referências
   * corrigidas. O redirect abaixo existe porque a URL errada PODE estar salva
   * no favorito de alguém, num link colado no WhatsApp ou num relatório antigo
   * — e uma tela que some é indistinguível de uma tela que quebrou.
   *
   * Permanente (308): a URL certa é a nova, e o navegador deve aprender isso.
   */
  async redirects() {
    return [
      { source: "/properties/mtching", destination: "/properties/matching", permanent: true },
    ];
  },
  /**
   * ── CACHE: A CAUSA DO INCIDENTE DE 31/07/2026 ────────────────────────────
   *
   * Medido em produção, no HTML de `/login`:
   *
   *     cache-control: s-maxage=31536000        ← UM ANO no CDN
   *     x-hcdn-cache-status: HIT
   *     age: 11231                              ← 3 horas parado no edge
   *
   * E dos 13 chunks que esse HTML pedia, **2 respondiam HTTP 404**.
   *
   * A cadeia é essa:
   *
   *   1. o CDN guardou o HTML de um build antigo, por um ANO;
   *   2. um build novo subiu na origem, com chunks de nomes novos;
   *   3. o HTML cacheado continua pedindo os chunks velhos;
   *   4. dois deles não existem mais → 404;
   *   5. sem eles o React **não hidrata**;
   *   6. o usuário vê o payload serializado como texto, sem formulário.
   *
   * E navegadores diferentes viam estados diferentes porque cada um bate numa
   * borda diferente do CDN (`asc-edge7`, `asc-edge10`…), cada uma com HTML de
   * idade diferente. Não era o navegador: era qual cópia velha ele alcançou.
   *
   * ── A REGRA ──────────────────────────────────────────────────────────────
   *
   * **HTML nunca pode viver mais que o build que o gerou.** Ele carrega os
   * nomes dos chunks daquele build, e esses nomes morrem no deploy seguinte.
   *
   * `/_next/static/*` é o oposto: nome com hash de conteúdo, imutável por
   * construção. Cachear por um ano ali é correto e é o que torna o site rápido.
   *
   * ── A ORDEM, QUE EU ERREI E A MEDIÇÃO CORRIGIU ──────────────────────────
   *
   * A primeira versão pôs a exceção dos estáticos ANTES da regra geral,
   * assumindo "a primeira que casa vence". **Está errado.** O Next aplica
   * TODAS as regras que casam, e para a mesma chave **a última vence**.
   *
   * Medido servindo o build: o chunk de `/_next/static` saiu com `no-store` —
   * exatamente a correção preguiçosa que este comentário existe para impedir,
   * e que teria matado todo o cache do site.
   *
   * Por isso a regra geral vem PRIMEIRO e as específicas DEPOIS.
   */
  async headers() {
    return [
      {
        // Regra geral PRIMEIRO: documentos HTML. `no-store` no CDN e no
        // navegador — nenhuma cópia sobrevive ao build que a produziu.
        source: "/(.*)",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        ],
      },
      {
        // Endpoints de estado: a resposta descreve AGORA. Prontidão cacheada
        // afirma saúde passada.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        // Imutável de verdade: o nome contém o hash do conteúdo. Se o conteúdo
        // muda, o nome muda — não existe cópia velha para servir. Esta regra
        // vem por ÚLTIMO para sobrescrever o `no-store` da geral.
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },

  /**
   * ── O BUILD_ID PASSA A SER O COMMIT ──────────────────────────────────────
   *
   * Sem isto o Next gera um id aleatório por build. Dois builds do mesmo commit
   * produzem ids diferentes, e os caminhos de `/_next/static/<BUILD_ID>/` mudam
   * sem que nada no código tenha mudado — o que torna impossível dizer, olhando
   * uma URL de chunk, de qual versão ela veio.
   *
   * Com o commit no id, a pergunta "este chunk é do build que está no ar?"
   * responde-se lendo a URL. Sem `ATLAS_BUILD_COMMIT` o Next volta ao padrão
   * (devolvendo `null`), em vez de inventar um id que não corresponde a nada.
   */
  generateBuildId: async () => process.env.ATLAS_BUILD_COMMIT?.trim() || null,
};

export default nextConfig;
