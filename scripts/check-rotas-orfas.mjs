#!/usr/bin/env node
/**
 * ROTA QUE NINGUÉM CHAMA — o portão para a classe de defeito mais cara do dia.
 *
 * ── POR QUE ESTE ARQUIVO EXISTE ─────────────────────────────────────────────
 *
 * Em 2026-07-30 apareceram TRÊS rotas construídas, testadas e inalcançáveis:
 *
 *   /api/v1/crm/compatibilidade ..... motor de 14 critérios, painel pronto, não montado
 *   /api/v1/crm/vendas-sem-valor .... contrato e prova de 17 verificações, nenhuma tela
 *   perguntas que destravam ......... calculadas pelo motor, exibidas em lugar nenhum
 *
 * As três foram achadas UMA A UMA, por acaso, olhando outra coisa. A terceira só
 * apareceu porque a primeira venda fecha amanhã e alguém perguntou onde se
 * registra o valor. Achar por acaso não é método.
 *
 * ── O QUE CONTA COMO CHAMADOR ───────────────────────────────────────────────
 *
 * Tela, componente, hook, lib, script ou teste que mencione o caminho da rota —
 * e também o AGENDADOR (`config/workers-schedule.json`), porque rota de worker é
 * chamada por cron, não por clique. Ignorar o cron faria este portão acusar 7
 * rotas corretamente ligadas, e guarda que reprova quem está certo é abandonada
 * na primeira semana.
 *
 * ── A LINHA DE BASE É DECLARADA, NÃO ESCONDIDA ──────────────────────────────
 *
 * As 11 órfãs de hoje ficam listadas abaixo COM MOTIVO. Não é anistia: é registro.
 * O portão falha quando aparece uma órfã NOVA — o que impede a classe de crescer
 * enquanto o passivo existente fica visível em vez de virar ruído de fundo.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const raiz = process.cwd();

/** Chamadas de fora do código: webhook de portal, teste manual de integração. */
const CHAMADAS_DE_FORA = new Map([
  ["/api/webhooks/portals/[provider]", "webhook: quem chama é o portal parceiro, não o nosso código"],
  ["/api/v1/integrations/portals/webhook-test", "ferramenta de diagnóstico, chamada à mão ao configurar um portal"],
]);

/**
 * O passivo conhecido em 2026-07-30. Cada uma precisa de decisão: ligar em tela,
 * ligar no cron, ou remover. Enquanto não decidem, ficam AQUI e visíveis.
 */
const ORFAS_CONHECIDAS = new Map([
  ["/api/atlas2030/memory/write", "Atlas 2030: escrita de memória sem tela nem cron"],
  ["/api/atlas2030/simulations/run", "Atlas 2030: simulação sem gatilho"],
  ["/api/v1/analytics/projecao-realizado", "ledger de projeção×realizado — construído e nunca ligado"],
  ["/api/v1/atlas/gemeo-digital", "gêmeo digital sem consumidor"],
  ["/api/v1/governance/autonomy", "níveis de autonomia da IA sem tela de governança"],
  ["/api/v1/governance/material-storage-migration", "migração de material: ferramenta de operação, uso manual"],
  ["/api/v1/integrations/meta/backfill", "reprocessamento da Meta, uso manual"],
  ["/api/v1/kaizen", "fila de melhoria contínua sem tela"],
  ["/api/v1/kaizen/[id]", "idem"],
  ["/api/v1/marketing/lead-forms", "formulários da Meta sem tela que os liste"],
  ["/api/atlas2030/data-products/publish", "Atlas 2030: publicação de data product sem gatilho"],
  ["/api/atlas2030/graph/upsert", "Atlas 2030: escrita no grafo sem gatilho"],
  ["/api/v1/ai/director-briefing", "briefing do diretor gerado e não exibido em tela nenhuma"],
  ["/api/v1/marketing/ad-performance", "desempenho de anúncio sem painel que o consuma"],
  ["/api/v1/rbac/me", "perfil e permissões do usuário logado — nenhuma tela pergunta"],
]);

function andar(dir, filtro, saida = []) {
  let entradas;
  try {
    entradas = readdirSync(dir, { withFileTypes: true });
  } catch {
    return saida;
  }
  for (const e of entradas) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!/node_modules|\.next|dist|\.git/.test(p)) andar(p, filtro, saida);
    } else if (filtro(p, e.name)) saida.push(p);
  }
  return saida;
}

const rotas = andar(join(raiz, "app/api"), (_p, nome) => nome === "route.ts");

/**
 * QUEM CONTA COMO CHAMADOR — e por que `scripts/` e `tests/` ficam DE FORA.
 *
 * A primeira versão varria `scripts/` e devolveu ZERO órfãs onde a varredura à
 * mão tinha achado 20. Causa: este próprio arquivo lista as URLs em
 * `ORFAS_CONHECIDAS`, e ele estava se lendo — cada órfã "aparecia" na declaração
 * que diz que ela é órfã. Autorreferência perfeita, portão inútil.
 *
 * Mas o conserto não é só excluir este arquivo. Script de verificação e contrato
 * mencionam rotas para afirmar coisas sobre elas, e isso NÃO as torna alcançáveis
 * por uma pessoa usando o produto. Alcançável é o que `app/` (fora de `app/api`),
 * `components/`, `hooks/` e `lib/` chamam — mais o AGENDADOR, porque worker é
 * chamado por cron e não por clique.
 *
 * `config/` entra só por causa de `workers-schedule.json`.
 */
const fontes = ["app", "components", "lib", "hooks", "config"].flatMap((d) =>
  andar(
    join(raiz, d),
    (p, nome) => /\.(tsx?|mjs|js|json)$/.test(nome) && !p.includes("/app/api/"),
  ),
);
const texto = fontes
  .map((f) => {
    try {
      return readFileSync(f, "utf8");
    } catch {
      return "";
    }
  })
  .join("\n");

const orfas = [];
for (const arquivo of rotas) {
  const url = "/" + arquivo.replace(raiz + "/", "").replace(/^app\//, "").replace(/\/route\.ts$/, "");
  // Segmento dinâmico vira curinga: `/api/v1/leads/[id]` casa com `/api/v1/leads/${id}`.
  const padrao = url
    .replace(/\[\.\.\.[^\]]+\]/g, '[^"`\\s)]+')
    .replace(/\[[^\]]+\]/g, '[^"`/\\s)]+')
    .replace(/\//g, "\\/");
  if (!new RegExp(padrao).test(texto)) orfas.push(url);
}

const novas = orfas.filter((u) => !CHAMADAS_DE_FORA.has(u) && !ORFAS_CONHECIDAS.has(u));
const sumiram = [...ORFAS_CONHECIDAS.keys()].filter((u) => !orfas.includes(u));

console.log(`rotas de API: ${rotas.length}`);
console.log(`sem chamador: ${orfas.length}`);
console.log(`  chamadas de fora (declaradas): ${CHAMADAS_DE_FORA.size}`);
console.log(`  passivo conhecido (declarado): ${ORFAS_CONHECIDAS.size}`);

if (sumiram.length) {
  // Notícia boa, e ela precisa aparecer: quem ligou a rota deve tirar a linha
  // daqui, senão a lista envelhece e vira mentira.
  console.log(`\n✔ ${sumiram.length} deixaram de ser órfãs — remova da lista ORFAS_CONHECIDAS:`);
  for (const u of sumiram) console.log(`    ${u}`);
}

if (novas.length) {
  console.log(`\n✘ ÓRFÃ NOVA — construída e inalcançável:`);
  for (const u of novas) console.log(`    ${u}`);
  console.log(
    `\nUma rota sem chamador não é código a mais: é trabalho pago que entrega zero,\n` +
      `e some da vista até alguém precisar dela num dia ruim. Ligue em tela, ligue no\n` +
      `cron, ou remova. Se for chamada de fora, declare em CHAMADAS_DE_FORA com o motivo.`,
  );
  process.exit(1);
}

console.log(`\n✔ nenhuma órfã nova`);
process.exit(0);
