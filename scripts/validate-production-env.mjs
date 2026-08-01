#!/usr/bin/env node
/**
 * VALIDAÇÃO DE AMBIENTE DE PRODUÇÃO.
 *
 * Imprime **somente o NOME** de cada variável e um destes estados:
 * PRESENT · MISSING · INVALID · NOT_APPLICABLE. **Nenhum valor é impresso**,
 * nem parcial, nem mascarado — máscara de segredo já vazou segredo em produto
 * demais, e o comprimento sozinho já é dica.
 *
 * ── A REGRA QUE ORGANIZA ISTO ───────────────────────────────────────────────
 *
 * Faltar variável de banco e faltar variável de Telegram são coisas diferentes.
 * A primeira impede subir; a segunda desliga um aviso. Tratar as 73 como
 * igualmente urgentes faz ninguém preencher nenhuma.
 *
 * Só o grupo BLOQUEIA reprova. Os demais viram AVISO, e o worker/rota
 * correspondente falha fechado por conta própria.
 *
 * uso:  node scripts/validate-production-env.mjs
 * saída: 0 = pode subir · 1 = falta variável crítica
 */
const GRUPOS = [
  {
    nome: "A · BLOQUEIA A SUBIDA — banco e runtime",
    bloqueia: true,
    vars: [
      ["NEXT_PUBLIC_SUPABASE_URL", "url"],
      ["SUPABASE_SERVICE_ROLE_KEY", "jwt"],
      // Duas gerações de nome para a MESMA chave pública convivem no produto:
      // o Supabase renomeou `anon` para `publishable`, e o código aceita as
      // duas. Exigir só uma reprovaria ambiente correto — e um validador que
      // reprova o certo é desligado no primeiro deploy.
      [["NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"], "jwt"],
    ],
  },
  {
    nome: "B · BLOQUEIA — identidade do build",
    bloqueia: true,
    vars: [["ATLAS_BUILD_COMMIT", "commit"]],
  },
  {
    nome: "C · BLOQUEIA A AUTOMAÇÃO — 19 workers recusam sem isto",
    bloqueia: true,
    vars: [["ATLAS_CRON_SECRET", "texto"]],
  },
  {
    nome: "D · integrações — sem elas o CRM funciona, a integração não",
    bloqueia: false,
    vars: [
      ["META_APP_SECRET", "texto"], ["META_ADS_ACCESS_TOKEN", "texto"],
      ["META_AD_ACCOUNT_ID", "texto"], ["ATLAS_META_CAPI_ENABLED", "booleano"],
      ["TELEGRAM_BOT_TOKEN", "texto"], ["OPENAI_API_KEY", "texto"],
      ["ANTHROPIC_API_KEY", "texto"], ["PERPLEXITY_API_KEY", "texto"],
    ],
  },
  {
    nome: "E · runtime — têm padrão seguro quando ausentes",
    bloqueia: false,
    vars: [["PORT", "numero"], ["NODE_ENV", "texto"], ["NEXT_PUBLIC_APP_URL", "url"]],
  },
];

const valida = (valor, forma) => {
  if (!valor || !String(valor).trim()) return "MISSING";
  const v = String(valor).trim();
  if (forma === "url") return /^https?:\/\/.+/.test(v) ? "PRESENT" : "INVALID";
  if (forma === "jwt") return /^eyJ[A-Za-z0-9_-]+\./.test(v) || v.length > 30 ? "PRESENT" : "INVALID";
  if (forma === "numero") return /^\d+$/.test(v) ? "PRESENT" : "INVALID";
  if (forma === "booleano") return /^(true|false|1|0)$/i.test(v) ? "PRESENT" : "INVALID";
  // Commit curto tem 7 caracteres; completo, 40. A régua de "segredo com 12+"
  // reprovaria um hash legítimo — foi o que aconteceu na primeira versão.
  if (forma === "commit") return /^[0-9a-f]{7,40}$/i.test(v) ? "PRESENT" : "INVALID";
  // Segredo curto demais é quase sempre um placeholder esquecido. Já aconteceu
  // aqui: META_APP_SECRET com 9 caracteres devolvia 401 em todo webhook.
  return v.length >= 12 ? "PRESENT" : "INVALID";
};

let criticasFaltando = 0;
let avisos = 0;

console.log("VALIDAÇÃO DE AMBIENTE — nenhum valor é impresso, só o nome e o estado\n");
for (const grupo of GRUPOS) {
  console.log(grupo.nome);
  for (const [chave, forma] of grupo.vars) {
    // Uma variável pode ter nomes alternativos aceitos pelo produto. Basta um
    // deles estar correto — e o rótulo mostra QUAL foi aceito, para ninguém
    // sair procurando o outro.
    const nomes = Array.isArray(chave) ? chave : [chave];
    const encontrado = nomes.find((n) => valida(process.env[n], forma) === "PRESENT");
    const estado = encontrado ? "PRESENT" : valida(process.env[nomes[0]], forma);
    const nome = encontrado ?? nomes.join(" | ");
    const marca = estado === "PRESENT" ? "✔" : grupo.bloqueia ? "✘" : "•";
    console.log(`  ${marca} ${nome.padEnd(40)} ${estado}`);
    if (estado !== "PRESENT") { if (grupo.bloqueia) criticasFaltando += 1; else avisos += 1; }
  }
  console.log("");
}

if (criticasFaltando > 0) {
  console.log(`✘ ${criticasFaltando} variável(is) CRÍTICA(s) ausente(s) ou inválida(s). A aplicação não deve subir.`);
  console.log("  Preencha em .env.production a partir de .env.production.example.");
  process.exit(1);
}
console.log(`✔ Ambiente apto a subir.${avisos ? ` ${avisos} integração(ões) opcional(is) desligada(s) — cada uma falha fechada por conta própria.` : ""}`);
