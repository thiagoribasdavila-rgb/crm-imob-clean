/**
 * Teste adversarial da CAMADA GRATUITA DE IA.
 *
 * Por que existe: em 2026-07-26 a medição mostrou Anthropic com chave inválida e
 * OpenAI sem saldo. Dois dos três provedores pagos fora, e com eles briefing,
 * copy e qualificação. A camada gratuita entrou para que a operação não dependa
 * de um cartão para voltar a funcionar.
 *
 * O que este portão protege não é a existência dos provedores — é que eles
 * passem pelo MESMO caminho disciplinado dos demais:
 *   - registro único (nada de lista escrita à mão em dois lugares, que foi como
 *     o /api/ai/provider-test recusava provedor que já existia);
 *   - prontidão derivada do registro, senão provedor novo fica inalcançável;
 *   - guard de dado pessoal preservado;
 *   - Ollama funcionando SEM chave, porque roda na própria máquina;
 *   - teste de saúde por GERAÇÃO, não por listagem — foi listando modelos que a
 *     OpenAI passou por saudável estando sem saldo.
 *
 * 100% determinístico: só lê arquivos do repo. Sem rede.
 *
 * Rodar da raiz do repo: node scripts/check-free-ai-tier.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (p) => (fs.existsSync(path.join(root, p)) ? fs.readFileSync(path.join(root, p), "utf8") : null);

const router = ler("lib/ai/provider-router.ts");
const health = ler("scripts/integrations-health.mjs");
const testRoute = ler("app/api/ai/provider-test/route.ts");
const doc = ler("docs/CAMADA_GRATUITA_DE_IA.md");
const envConfig = ler("config/environment-variables.json");

const falhas = [];
let passaram = 0;
const check = (nome, ok, detalhe = "") => {
  if (ok) passaram += 1;
  else falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};

const GRATUITOS = ["gemini", "groq", "cerebras", "mistral", "openrouter", "ollama"];

check("caso 1: o roteador de provedores existe", Boolean(router));
check("caso 2: o centro de saúde existe", Boolean(health));
check("caso 3: a documentação de ativação existe", Boolean(doc), "docs/CAMADA_GRATUITA_DE_IA.md ausente");

if (router) {
  for (const provedor of GRATUITOS) {
    check(
      `caso 4/${provedor}: está no registro de provedores compatíveis`,
      new RegExp(`\\n\\s*${provedor}:\\s*\\{[^}]*baseUrl:`).test(router),
      "provedor anunciado e não registrado é provedor que nunca é chamado",
    );
  }
  check(
    "caso 5: os gratuitos são marcados como tal, e não misturados aos pagos",
    (router.match(/gratuito:\s*true/g) ?? []).length >= GRATUITOS.length,
    "sem a marca não dá para listar a camada gratuita nem explicar custo zero",
  );
  check(
    "caso 6: existe catálogo exportado da camada gratuita",
    /export const provedoresGratuitos/.test(router) && /export function catalogoDeProvedoresGratuitos/.test(router),
    "sem catálogo, cada tela recria a lista e elas divergem",
  );
  check(
    "caso 7: a prontidão é DERIVADA do registro, não escrita à mão",
    /Object\.keys\(economyProviders\)[\s\S]{0,200}configuredEconomyProvider/.test(router),
    "lista manual de prontidão deixa provedor novo inalcançável pela ordem de roteamento",
  );
  check(
    "caso 8: provedor auto-hospedado funciona sem chave",
    // Ancora no PROVEDOR: `requerChave: false` solto podia estar em qualquer
    // entrada, e a checagem sobrevivia à mutação que passava a exigir chave do
    // Ollama — furo achado no teste deste próprio portão.
    /ollama:\s*\{[^}]*requerChave:\s*false/.test(router) && /config\.requerChave === false/.test(router),
    "exigir chave do Ollama o deixa eternamente 'não configurado' mesmo rodando",
  );
  check(
    "caso 9: o cabeçalho Authorization só é enviado quando há chave",
    /apiKey\s*\?\s*\{\s*Authorization/.test(router),
    "mandar 'Bearer undefined' para o Ollama quebra a chamada local",
  );
  check(
    "caso 10: o guard de dado pessoal continua valendo para todos",
    /containsPersonalData\) throw new Error\(`\$\{provider\} bloqueado para dados pessoais/.test(router),
    "camada gratuita não pode ser porta dos fundos para vazar dado de cliente",
  );
}

if (health) {
  check(
    "caso 11: o teste de saúde cobre a camada gratuita",
    /IA gratuita/.test(health),
    "provedor sem teste real é provedor que ninguém sabe se responde",
  );
  check(
    "caso 12: a prova é GERAÇÃO, não listagem de modelos",
    /respondeu 200 sem texto/.test(health) && /choices\?\.\[0\]\?\.message\?\.content/.test(health),
    "listar modelos foi exatamente como a OpenAI passou por saudável sem saldo",
  );
  check(
    "caso 13: o Ollama é testado sem chave e com erro de conexão tratado",
    /Ollama/.test(health) && /inacess[íi]vel/.test(health),
    "servidor local fora do ar precisa dizer isso, não estourar exceção",
  );
}

if (testRoute) {
  check(
    "caso 14: a rota de teste da diretoria usa a lista do roteador",
    // Importar não é usar: a linha de import mantinha o caso verde mesmo com a
    // lista voltando a ser manual. Exige o espalhamento DENTRO do Set.
    /new Set<EconomyProvider>\(\[[\s\S]{0,200}\.\.\.provedoresGratuitos/.test(testRoute),
    "lista escrita à mão aqui recusa provedor que já existe no roteador",
  );
}

if (envConfig) {
  const classificadas = new Set(JSON.parse(envConfig).variables.map((v) => v.name));
  const faltando = ["GEMINI_API_KEY", "GROQ_API_KEY", "CEREBRAS_API_KEY", "MISTRAL_API_KEY", "OPENROUTER_API_KEY", "ATLAS_OLLAMA_MODEL"]
    .filter((nome) => !classificadas.has(nome));
  check(
    "caso 15: as variáveis novas estão classificadas no contrato de ambiente",
    faltando.length === 0,
    faltando.join(", "),
  );
}

if (doc) {
  check(
    "caso 16: a documentação não vende 'gratuito' como 'ilimitado'",
    /não é "ilimitado"|não é .ilimitado.|até o teto do provedor/i.test(doc),
    "prometer ilimitado garante uma parada de produção no dia em que a quota estourar",
  );
  check(
    "caso 17: a documentação diz onde pegar cada chave",
    ["aistudio.google.com", "console.groq.com", "cloud.cerebras.ai", "console.mistral.ai", "openrouter.ai"].every((o) => doc.includes(o)),
    "instrução sem endereço vira tarefa de adivinhação",
  );
}

// ---------------------------------------------------------------------------
console.log(`\ncheck-free-ai-tier: ${passaram} passaram, ${falhas.length} falharam.`);
if (falhas.length) {
  for (const f of falhas) console.error(`  FALHOU: ${f}`);
  process.exit(1);
}
