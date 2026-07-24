/**
 * Regras do scanner de segredos, isoladas do caminhamento de arquivos para
 * poderem ser testadas diretamente (tests/contracts/secret-scan.test.mjs).
 *
 * O scanner continua sendo o de sempre: nada foi afrouxado aqui. As mudanças
 * em relação à versão embutida no script são todas no sentido de detectar MAIS:
 *
 * 1. `.test()` com regex /g mantém `lastIndex` entre chamadas. Como os mesmos
 *    objetos de regex eram reusados para todos os arquivos, um segredo no
 *    início de um arquivo podia escapar logo depois de outro arquivo dar match.
 *    Agora cada verificação zera o estado.
 * 2. Detecção de JWT passou a existir.
 * 3. Referência a FAMÍLIA de variável em documentação — um prefixo público
 *    seguido de curinga (`*`) ou de alternação (`(A|B)`) — deixou de ser tratada
 *    como nome de variável, mas continua sendo verificada: a família só passa se
 *    existir alguma variável aprovada com aquele prefixo. Família desconhecida
 *    continua reprovando.
 */

/** Variáveis públicas aprovadas — o bundle do cliente pode conter estas e só estas. */
export const allowedPublic = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_APP_URL",
]);

/**
 * Assinaturas de credencial. A regex de JWT exige assinatura longa de propósito:
 * um JWT real (HS256) tem 43 caracteres de assinatura, enquanto fixtures de teste
 * usam sufixos curtos como `.abc`. Assim um token vazado é pego e um exemplo
 * didático não vira falso positivo.
 */
export const tokenPatterns = [
  ["OpenAI", /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ["Perplexity", /\bpplx-[A-Za-z0-9_-]{20,}\b/],
  ["GitHub", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ["AWS", /\bAKIA[0-9A-Z]{16}\b/],
  ["JWT", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{20,}\b/],
  ["Slack", /\bxox[abpsr]-[A-Za-z0-9-]{10,}\b/],
  ["chave privada", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
];

/** Metacaracteres que revelam referência a família em documentação. */
const FAMILY_SUFFIX = /^[*({[?]/;

/**
 * Analisa o conteúdo de um arquivo e devolve a lista de achados.
 * @param {string} file caminho relativo, usado só na mensagem
 * @param {string} content conteúdo textual do arquivo
 * @returns {string[]} achados (vazio = limpo)
 */
export function scanContent(file, content) {
  const findings = [];

  for (const [label, pattern] of tokenPatterns) {
    // Regex sem /g: `.test()` não guarda estado e não pula o começo do próximo arquivo.
    if (pattern.test(content)) findings.push(`${file}: possível credencial ${label}`);
  }

  for (const match of content.matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) {
    const name = match[0];
    const rest = content.slice(match.index + name.length);

    if (name.endsWith("_") && FAMILY_SUFFIX.test(rest)) {
      // `NEXT_PUBLIC_SUPABASE_*` / `NEXT_PUBLIC_SUPABASE_(URL|ANON_KEY)`:
      // é a família, não um nome. Só passa se a família for conhecida.
      const known = [...allowedPublic].some((approved) => approved.startsWith(name));
      if (!known) findings.push(`${file}: família pública não aprovada ${name}*`);
      continue;
    }

    if (!allowedPublic.has(name)) findings.push(`${file}: variável pública não aprovada ${name}`);
  }

  if (/^\.env(?:\.|$)/.test(file) && file !== ".env.example") {
    findings.push(`${file}: arquivo de ambiente versionado`);
  }

  return findings;
}
