/**
 * Teste adversarial das PROPOSTAS geradas de Arvo e Spin Mood.
 *
 * Alvos (artefatos versionados, saída determinística dos builders):
 *   docs/campaigns/arvo/campaign-spec.json       (scripts/build-arvo-proposal.mjs)
 *   docs/campaigns/spin-mood/campaign-spec.json  (scripts/build-spin-refresh.mjs)
 *
 * Garante, sem rede/banco/relógio/aleatório (só leitura de arquivo):
 *  1. Personas DISTINTAS (Arvo = investidor, Spin = morador) — os ângulos não
 *     podem ser o mesmo conjunto e cada proposta precisa de ângulo exclusivo.
 *  2. TODO status é PAUSED — nenhum ACTIVE em nenhum nível (campanha, conjunto,
 *     anúncio, passo de publicação).
 *  3. special_ad_categories == ["HOUSING"] em todo lugar onde a chave aparece.
 *  4. Copy sem fato inventado ("universidades", "polo gastronômico", "curta
 *     estadia") e sem faixa de renda no criativo ("renda de N salários").
 *  5. O mount do Spin NÃO tem create_campaign e os anúncios referenciam
 *     {{step0.id}}/{{step1.id}} — sem off-by-one (checagem genérica do grafo de
 *     placeholders nas três listas de passos).
 *  6. Calibragem do Arvo: R$ 100/dia = R$ 700/semana e break-even CPL = R$ 14
 *     (50 conversões/semana para sair do aprendizado).
 *
 * Rodar da raiz do repo: node scripts/check-arvo-spin-proposals.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARVO_PATH = path.join(root, "docs", "campaigns", "arvo", "campaign-spec.json");
const SPIN_PATH = path.join(root, "docs", "campaigns", "spin-mood", "campaign-spec.json");

let pass = 0;
let fail = 0;
const t = (name, ok, extra = "") => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? "✅" : "❌"} ${name}${!ok && extra ? ` — ${extra}` : ""}`);
};

// --------------------------------------------------------------------------
// utilitários puros
// --------------------------------------------------------------------------
const norm = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Caminha o JSON inteiro entregando { path, key, value } de cada nó. */
function walk(node, visit, at = "$") {
  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, visit, `${at}[${i}]`));
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      const p = `${at}.${k}`;
      visit({ path: p, key: k, value: v });
      walk(v, visit, p);
    }
  }
}

/** Todas as strings sob um nó (usado nas subárvores de criativo). */
function stringsUnder(node, at) {
  const out = [];
  if (typeof node === "string") return [{ path: at, text: node }];
  if (Array.isArray(node)) {
    node.forEach((v, i) => out.push(...stringsUnder(v, `${at}[${i}]`)));
    return out;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) out.push(...stringsUnder(v, `${at}.${k}`));
  }
  return out;
}

const get = (obj, dotted) =>
  dotted.split(".").reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);

// --------------------------------------------------------------------------
// carga dos alvos
// --------------------------------------------------------------------------
for (const p of [ARVO_PATH, SPIN_PATH]) {
  if (!fs.existsSync(p)) {
    console.log(`❌ alvo ausente: ${p}`);
    console.log(`\n0/1 casos ok`);
    process.exit(1);
  }
}
const arvoRaw = fs.readFileSync(ARVO_PATH, "utf8");
const spinRaw = fs.readFileSync(SPIN_PATH, "utf8");
let arvo;
let spin;
try {
  arvo = JSON.parse(arvoRaw);
  spin = JSON.parse(spinRaw);
} catch (err) {
  console.log(`❌ JSON inválido em um dos specs — ${err.message}`);
  console.log(`\n0/1 casos ok`);
  process.exit(1);
}

const arvoSteps = arvo?.generated?.publicationSteps ?? [];
const spinMount = spin?.refresh_2026_07?.mount_into_existing_campaign?.steps ?? [];
const spinFull = spin?.refresh_2026_07?.full_publication_if_not_live ?? [];

// ==========================================================================
// 1) PERSONAS DISTINTAS
// ==========================================================================
{
  const arvoFocus = norm(arvo?.persona?.focus ?? "");
  const spinFocus = norm(spin?.persona?.focus ?? "");
  t(
    "persona do Arvo é INVESTIDOR",
    arvoFocus.includes("investidor") && !arvoFocus.includes("morador"),
    `persona.focus = ${JSON.stringify(arvo?.persona?.focus)}`,
  );
  t(
    "persona do Spin é MORADOR",
    spinFocus.includes("morador") && !spinFocus.includes("investidor"),
    `persona.focus = ${JSON.stringify(spin?.persona?.focus)}`,
  );

  const arvoAngles = arvo?.persona?.angles ?? [];
  const spinAngles = spin?.persona?.angles ?? [];
  const okShape = Array.isArray(arvoAngles) && arvoAngles.length >= 2 && Array.isArray(spinAngles) && spinAngles.length >= 2;
  t("cada proposta declara ângulos (>= 2) na persona", okShape, `arvo=${JSON.stringify(arvoAngles)} spin=${JSON.stringify(spinAngles)}`);

  const setA = new Set(arvoAngles.map(norm));
  const setS = new Set(spinAngles.map(norm));
  const sameSet = setA.size === setS.size && [...setA].every((a) => setS.has(a));
  t(
    "os ângulos das duas propostas NÃO são o mesmo conjunto",
    okShape && !sameSet,
    `arvo=${JSON.stringify([...setA])} spin=${JSON.stringify([...setS])}`,
  );

  const exclusiveA = [...setA].filter((a) => !setS.has(a));
  const exclusiveS = [...setS].filter((a) => !setA.has(a));
  t(
    "cada proposta tem ângulo EXCLUSIVO (diferenciação real no criativo)",
    exclusiveA.length > 0 && exclusiveS.length > 0,
    `exclusivos arvo=${JSON.stringify(exclusiveA)} spin=${JSON.stringify(exclusiveS)}`,
  );
  t(
    "ângulo-âncora do Arvo é de investimento e não aparece no Spin",
    setA.has("investimento") && !setS.has("investimento"),
    `arvo=${JSON.stringify([...setA])} spin=${JSON.stringify([...setS])}`,
  );
  t(
    "ângulo-âncora do Spin é de morador (sair_do_aluguel) e não aparece no Arvo",
    setS.has("sair_do_aluguel") && !setA.has("sair_do_aluguel"),
    `arvo=${JSON.stringify([...setA])} spin=${JSON.stringify([...setS])}`,
  );

  // a persona declarada tem de bater com o copy realmente gerado
  t(
    "ângulos gerados do Arvo batem com a persona declarada",
    eq(arvo?.generated?.copy?.angles, arvoAngles),
    `copy.angles = ${JSON.stringify(arvo?.generated?.copy?.angles)}`,
  );
  t(
    "ângulos gerados do Spin (refresh) batem com a persona declarada",
    eq(spin?.refresh_2026_07?.copy?.angles, spinAngles),
    `refresh.copy.angles = ${JSON.stringify(spin?.refresh_2026_07?.copy?.angles)}`,
  );

  // nomes de anúncio: um ângulo por anúncio, nenhum nome colidindo entre produtos
  const adNames = (steps) => steps.filter((s) => s?.kind === "create_ad").map((s) => norm(s?.payload?.name ?? ""));
  const arvoAdNames = adNames(arvoSteps);
  const spinAdNames = adNames(spinMount);
  t(
    "nomes de anúncio não colidem entre Arvo e Spin",
    arvoAdNames.length > 0 && spinAdNames.length > 0 && arvoAdNames.every((n) => !spinAdNames.includes(n)),
    `arvo=${JSON.stringify(arvoAdNames)} spin=${JSON.stringify(spinAdNames)}`,
  );
}

// ==========================================================================
// 2) TUDO PAUSED — nenhum ACTIVE em nenhum nível
// ==========================================================================
{
  const statuses = [];
  const activeStrings = [];
  for (const [label, spec] of [["arvo", arvo], ["spin", spin]]) {
    walk(spec, ({ path: p, key, value }) => {
      if (typeof value !== "string") return;
      if (/^(status|configured_status|effective_status)$/.test(key)) statuses.push({ path: `${label}${p.slice(1)}`, value });
      if (norm(value) === "active") activeStrings.push(`${label}${p.slice(1)}`);
    });
  }

  t("os specs declaram status (varredura encontrou nós)", statuses.length >= 8, `encontrados ${statuses.length}`);

  const activeStatuses = statuses.filter((s) => s.value.toUpperCase() === "ACTIVE");
  t(
    "nenhum status ACTIVE em nenhum nível dos dois specs",
    activeStatuses.length === 0,
    activeStatuses.map((s) => `${s.path} = "${s.value}"`).join(", "),
  );
  t(
    "nenhum valor literal \"ACTIVE\" solto nos specs",
    activeStrings.length === 0,
    activeStrings.join(", "),
  );

  // qualquer status em CAIXA-ALTA é status de ciclo de vida da Meta → tem de ser PAUSED
  const lifecycle = statuses.filter((s) => /^[A-Z_]+$/.test(s.value));
  const notPaused = lifecycle.filter((s) => s.value !== "PAUSED");
  t(
    "todo status de ciclo de vida (CAIXA-ALTA) é PAUSED",
    lifecycle.length >= 8 && notPaused.length === 0,
    notPaused.length ? notPaused.map((s) => `${s.path} = "${s.value}"`).join(", ") : `só ${lifecycle.length} status de ciclo de vida encontrados`,
  );

  // e explicitamente: todo passo que cria campanha/conjunto/anúncio nasce PAUSED
  const mustBePaused = [
    ["arvo.publicationSteps", arvoSteps],
    ["spin.mount", spinMount],
    ["spin.full_publication", spinFull],
  ];
  const offenders = [];
  let creators = 0;
  for (const [label, steps] of mustBePaused) {
    steps.forEach((s, i) => {
      if (!["create_campaign", "create_adset", "create_ad"].includes(s?.kind)) return;
      creators += 1;
      if (s?.payload?.status !== "PAUSED") offenders.push(`${label}[${i}] (${s?.kind}) status=${JSON.stringify(s?.payload?.status)}`);
    });
  }
  t(
    "todo passo create_campaign/adset/ad nasce com status PAUSED explícito",
    creators >= 12 && offenders.length === 0,
    offenders.length ? offenders.join(", ") : `apenas ${creators} passos criadores encontrados`,
  );

  t("governança do Arvo: nasce pausado + aprovação humana", arvo?.governance?.born_paused === true && arvo?.governance?.human_approval_before_publish === true);
  t("governança do Spin: aprovação humana antes de publicar", spin?.governance?.human_approval_before_publish === true);
  t(
    "conjuntos declarados do Spin (ad_sets[]) estão PAUSED",
    Array.isArray(spin?.ad_sets) && spin.ad_sets.length >= 2 && spin.ad_sets.every((a) => a?.status === "PAUSED"),
    JSON.stringify((spin?.ad_sets ?? []).map((a) => a?.status)),
  );
}

// ==========================================================================
// 3) special_ad_categories ["HOUSING"]
// ==========================================================================
{
  const found = [];
  for (const [label, spec] of [["arvo", arvo], ["spin", spin]]) {
    walk(spec, ({ path: p, key, value }) => {
      if (key === "special_ad_categories") found.push({ path: `${label}${p.slice(1)}`, value });
    });
  }
  const bad = found.filter((f) => !eq(f.value, ["HOUSING"]));
  t(
    "special_ad_categories aparece nas campanhas dos dois specs",
    found.length >= 3,
    `encontradas ${found.length} ocorrências`,
  );
  t(
    'toda special_ad_categories é exatamente ["HOUSING"]',
    found.length >= 3 && bad.length === 0,
    bad.map((f) => `${f.path} = ${JSON.stringify(f.value)}`).join(", "),
  );
  t(
    "campanha do Arvo declara HOUSING + país BR",
    eq(arvo?.generated?.skeleton?.campaign?.special_ad_categories, ["HOUSING"]) &&
      eq(arvo?.generated?.skeleton?.campaign?.special_ad_category_country, ["BR"]),
    JSON.stringify(arvo?.generated?.skeleton?.campaign),
  );
  t(
    "campanha do Spin declara HOUSING + país BR",
    eq(spin?.campaign?.special_ad_categories, ["HOUSING"]) && eq(spin?.campaign?.special_ad_category_country, ["BR"]),
    JSON.stringify(spin?.campaign),
  );

  // sob HOUSING a segmentação é travada: 18-65, sem gênero
  const targets = [
    ["arvo.generated.targeting", arvo?.generated?.targeting],
    ["spin.refresh.targeting", spin?.refresh_2026_07?.targeting],
  ];
  const badTargets = targets.filter(([, tg]) => !(tg?.age_min === 18 && tg?.age_max === 65 && eq(tg?.genders, [])));
  t(
    "segmentação gerada respeita a trava HOUSING (18-65, sem gênero)",
    badTargets.length === 0,
    badTargets.map(([l, tg]) => `${l} = ${JSON.stringify(tg)}`).join(", "),
  );
}

// ==========================================================================
// 4) COPY SEM FATO INVENTADO E SEM FAIXA DE RENDA
// ==========================================================================
{
  /** Subárvores que são 100% texto de criativo (excluem notas/compliance). */
  const creativeStrings = (spec, label, dotted, steps) => {
    const out = [];
    for (const d of dotted) out.push(...stringsUnder(get(spec, d), `${label}.${d}`));
    for (const [i, s] of steps.entries()) {
      if (typeof s?.payload?.name === "string") out.push({ path: `${label}.steps[${i}].payload.name`, text: s.payload.name });
      const afs = s?.payload?.asset_feed_spec;
      if (afs) {
        for (const k of ["bodies", "titles", "descriptions"]) {
          out.push(...stringsUnder(afs[k], `${label}.steps[${i}].asset_feed_spec.${k}`));
        }
      }
    }
    return out;
  };

  const arvoTexts = creativeStrings(
    arvo,
    "arvo",
    [
      "generated.copy.primaryTexts",
      "generated.copy.headlines",
      "generated.copy.descriptions",
      "generated.assetFeedSpec.bodies",
      "generated.assetFeedSpec.titles",
      "generated.assetFeedSpec.descriptions",
    ],
    arvoSteps,
  );
  const spinTexts = creativeStrings(
    spin,
    "spin",
    [
      "copy.morador.primary_text",
      "copy.morador.headline",
      "copy.morador.description",
      "copy.investidor.headline",
      "copy.investidor.description",
      "refresh_2026_07.copy.primaryTexts",
      "refresh_2026_07.copy.headlines",
      "refresh_2026_07.copy.descriptions",
      "refresh_2026_07.asset_feed_spec.bodies",
      "refresh_2026_07.asset_feed_spec.titles",
      "refresh_2026_07.asset_feed_spec.descriptions",
    ],
    [...spinMount, ...spinFull],
  );

  // guarda contra falso verde: se os caminhos deixarem de existir, o teste cai
  t("copy do Arvo foi coletado para varredura", arvoTexts.length >= 18, `coletadas ${arvoTexts.length} strings`);
  t("copy do Spin foi coletado para varredura", spinTexts.length >= 25, `coletadas ${spinTexts.length} strings`);

  const FORBIDDEN = [
    { label: "universidades", re: /universidad|universitari/ },
    { label: "polo gastronômico", re: /polo gastronomic|hub gastronomic/ },
    { label: "curta estadia", re: /curta estadia|estadia curta|short stay|aluguel por temporada/ },
  ];
  for (const { label, re } of FORBIDDEN) {
    const hits = [...arvoTexts, ...spinTexts].filter((s) => re.test(norm(s.text)));
    t(
      `copy não inventa fato: "${label}" ausente dos criativos`,
      hits.length === 0,
      hits.map((h) => `${h.path}: "${h.text}"`).join(" | "),
    );
  }

  const INCOME = /renda de \d|renda a partir de|\d+\s*sal[áa]rios? m[íi]nimos?|\d+\s*sal[áa]rios?|faixa de renda/;
  const incomeHits = [...arvoTexts, ...spinTexts].filter((s) => INCOME.test(norm(s.text)));
  t(
    "copy não cita faixa de renda no criativo (risco HOUSING)",
    incomeHits.length === 0,
    incomeHits.map((h) => `${h.path}: "${h.text}"`).join(" | "),
  );

  // a faixa de renda é legítima como QUALIFICADOR do formulário — não no criativo
  t(
    "renda continua sendo qualificada no formulário do Spin (não no criativo)",
    (spin?.lead_form?.fields ?? []).some((f) => f?.key === "renda" && f?.qualifier === true),
    JSON.stringify((spin?.lead_form?.fields ?? []).map((f) => f?.key)),
  );

  t("Arvo: nenhuma violação de política de copy registrada", eq(arvo?.generated?.copyPolicyViolations, []), JSON.stringify(arvo?.generated?.copyPolicyViolations));
  t("Spin: nenhuma violação de política de copy registrada", eq(spin?.refresh_2026_07?.copy_policy_violations, []), JSON.stringify(spin?.refresh_2026_07?.copy_policy_violations));

  // o Arvo lembra explicitamente que faixa de renda não consta do book
  t(
    "Arvo registra o lembrete de não inventar faixa de renda",
    /nao inventar/.test(norm(arvo?.inventory_summary?.reminder ?? "")),
    JSON.stringify(arvo?.inventory_summary?.reminder),
  );
}

// ==========================================================================
// 5) MOUNT DO SPIN SEM create_campaign + PLACEHOLDERS SEM OFF-BY-ONE
// ==========================================================================
{
  t("mount do Spin tem passos", spinMount.length >= 4, `${spinMount.length} passos`);
  t(
    "mount do Spin NÃO cria campanha (monta na campanha existente)",
    spinMount.length > 0 && !spinMount.some((s) => s?.kind === "create_campaign"),
    JSON.stringify(spinMount.map((s) => s?.kind)),
  );
  t(
    "mount do Spin começa por create_adset e depois create_creative",
    spinMount[0]?.kind === "create_adset" && spinMount[1]?.kind === "create_creative",
    JSON.stringify(spinMount.map((s) => s?.kind)),
  );
  t(
    "conjunto do mount aponta para a campanha EXISTENTE (não para {{stepN.id}})",
    typeof spinMount[0]?.payload?.campaign_id === "string" && !/\{\{step\d+\.id\}\}/.test(spinMount[0].payload.campaign_id),
    JSON.stringify(spinMount[0]?.payload?.campaign_id),
  );

  const mountAds = spinMount.filter((s) => s?.kind === "create_ad");
  const badAds = mountAds.filter(
    (s) => s?.payload?.adset_id !== "{{step0.id}}" || s?.payload?.creative?.creative_id !== "{{step1.id}}",
  );
  t(
    "anúncios do mount referenciam {{step0.id}} (adset) e {{step1.id}} (creative)",
    mountAds.length === 4 && badAds.length === 0,
    badAds.length
      ? badAds.map((s) => `${s?.payload?.name}: adset=${s?.payload?.adset_id} creative=${s?.payload?.creative?.creative_id}`).join(" | ")
      : `esperava 4 anúncios, achei ${mountAds.length}`,
  );
  t(
    "mount não referencia {{step2.id}} nem além (off-by-one herdado da publicação cheia)",
    !/\{\{step([2-9]|\d{2,})\.id\}\}/.test(JSON.stringify(spinMount)),
    (JSON.stringify(spinMount).match(/\{\{step\d+\.id\}\}/g) ?? []).join(", "),
  );
  t(
    "dependsOn dos anúncios do mount é [0, 1]",
    mountAds.length > 0 && mountAds.every((s) => eq(s?.dependsOn, [0, 1])),
    JSON.stringify(mountAds.map((s) => s?.dependsOn)),
  );

  /** Validação genérica do grafo: todo {{stepN.id}} resolve para um passo ANTERIOR do tipo certo. */
  function graphProblems(steps, label) {
    const problems = [];
    steps.forEach((s, i) => {
      const refs = [...JSON.stringify(s?.payload ?? {}).matchAll(/\{\{step(\d+)\.id\}\}/g)].map((m) => Number(m[1]));
      for (const n of refs) {
        if (!(n < i)) problems.push(`${label}[${i}] (${s?.kind}) referencia {{step${n}.id}} que não é anterior`);
        else if (!steps[n]) problems.push(`${label}[${i}] referencia {{step${n}.id}} inexistente`);
      }
      const expect = (placeholder, kind, what) => {
        if (typeof placeholder !== "string") return;
        const m = placeholder.match(/^\{\{step(\d+)\.id\}\}$/);
        if (!m) return;
        const n = Number(m[1]);
        if (steps[n]?.kind !== kind) {
          problems.push(`${label}[${i}] (${s?.kind}) usa ${what}=${placeholder} mas step${n} é ${steps[n]?.kind ?? "inexistente"} (esperado ${kind})`);
        }
      };
      if (s?.kind === "create_adset") expect(s?.payload?.campaign_id, "create_campaign", "campaign_id");
      if (s?.kind === "create_ad") {
        expect(s?.payload?.adset_id, "create_adset", "adset_id");
        expect(s?.payload?.creative?.creative_id, "create_creative", "creative_id");
      }
      if (Array.isArray(s?.dependsOn)) {
        for (const n of refs) if (!s.dependsOn.includes(n)) problems.push(`${label}[${i}] referencia step${n} mas não declara em dependsOn`);
      }
    });
    return problems;
  }

  for (const [label, steps, minSteps] of [
    ["arvo.publicationSteps", arvoSteps, 6],
    ["spin.mount", spinMount, 6],
    ["spin.full_publication", spinFull, 7],
  ]) {
    const problems = graphProblems(steps, label);
    t(
      `grafo de placeholders íntegro em ${label} (sem off-by-one)`,
      steps.length >= minSteps && problems.length === 0,
      problems.length ? problems.join(" | ") : `esperava >= ${minSteps} passos, achei ${steps.length}`,
    );
  }

  // contraste explícito: na publicação CHEIA (com create_campaign no índice 0)
  // os anúncios andam um índice adiante — é exatamente o off-by-one que o mount evita
  const fullAds = spinFull.filter((s) => s?.kind === "create_ad");
  t(
    "publicação cheia do Spin (com create_campaign) usa {{step1.id}}/{{step2.id}}",
    spinFull[0]?.kind === "create_campaign" &&
      fullAds.length === 4 &&
      fullAds.every((s) => s?.payload?.adset_id === "{{step1.id}}" && s?.payload?.creative?.creative_id === "{{step2.id}}"),
    JSON.stringify(fullAds.map((s) => ({ adset: s?.payload?.adset_id, creative: s?.payload?.creative?.creative_id }))),
  );
  const arvoAds = arvoSteps.filter((s) => s?.kind === "create_ad");
  t(
    "Arvo (publicação cheia) usa {{step1.id}}/{{step2.id}} e cria a campanha no passo 0",
    arvoSteps[0]?.kind === "create_campaign" &&
      arvoSteps[1]?.payload?.campaign_id === "{{step0.id}}" &&
      arvoAds.length === 3 &&
      arvoAds.every((s) => s?.payload?.adset_id === "{{step1.id}}" && s?.payload?.creative?.creative_id === "{{step2.id}}"),
    JSON.stringify(arvoSteps.map((s) => s?.kind)),
  );
}

// ==========================================================================
// 6) CALIBRAGEM DO ARVO: R$ 100/dia = R$ 700/sem, break-even CPL = 14
// ==========================================================================
{
  const sizing = arvo?.sizing_calibration ?? {};
  t(
    "Arvo: verba diária R$ 100 e semanal R$ 700 (7 × diária)",
    sizing.daily_brl === 100 && sizing.weekly_brl === 700 && sizing.weekly_brl === sizing.daily_brl * 7,
    `daily=${sizing.daily_brl} weekly=${sizing.weekly_brl}`,
  );
  t(
    "Arvo: budget declarado bate com a calibragem (R$ 100/dia, R$ 700/sem)",
    arvo?.budget?.daily_brl === sizing.daily_brl && arvo?.budget?.weekly_brl === sizing.weekly_brl,
    JSON.stringify(arvo?.budget),
  );
  t(
    "Arvo: daily_budget da campanha em centavos = R$ 100 (10000)",
    arvo?.generated?.skeleton?.campaign?.daily_budget === sizing.daily_brl * 100 &&
      arvo?.generated?.skeleton?.weeklyBudgetBrl === sizing.weekly_brl,
    `daily_budget=${arvo?.generated?.skeleton?.campaign?.daily_budget} weeklyBudgetBrl=${arvo?.generated?.skeleton?.weeklyBudgetBrl}`,
  );
  t(
    "Arvo: break-even CPL declarado = R$ 14",
    sizing.break_even_cpl_brl === 14,
    `break_even_cpl_brl=${sizing.break_even_cpl_brl}`,
  );
  t(
    "Arvo: break-even é aritmeticamente coerente (700 ÷ 14 = 50 conversões/semana)",
    sizing.weekly_brl / sizing.break_even_cpl_brl === 50,
    `${sizing.weekly_brl} ÷ ${sizing.break_even_cpl_brl} = ${sizing.weekly_brl / sizing.break_even_cpl_brl}`,
  );

  const scenarios = Array.isArray(sizing.scenarios) ? sizing.scenarios : [];
  t("Arvo: cenários de sizing presentes (>= 3)", scenarios.length >= 3, `${scenarios.length} cenários`);

  const be = scenarios.find((s) => s?.cplBrl === sizing.break_even_cpl_brl);
  t(
    "Arvo: cenário do CPL de break-even sai do aprendizado com exatamente 50 conv/semana",
    !!be &&
      be.result?.expectedConversionsPerWeek === 50 &&
      be.result?.exitsLearning === true &&
      be.result?.minWeeklyToExitLearningBrl === sizing.weekly_brl &&
      be.result?.recommendedAdSets === 1,
    JSON.stringify(be?.result ?? null),
  );

  const inconsistent = scenarios.filter((s) => {
    const cpl = s?.cplBrl;
    const r = s?.result ?? {};
    if (typeof cpl !== "number" || cpl <= 0) return true;
    if (r.minWeeklyToExitLearningBrl !== 50 * cpl) return true;
    if (r.expectedConversionsPerWeek !== Math.round(sizing.weekly_brl / cpl)) return true;
    if (r.dailyBudgetPerAdSetBrl !== sizing.daily_brl) return true;
    if (r.exitsLearning !== cpl <= sizing.break_even_cpl_brl) return true;
    return false;
  });
  t(
    "Arvo: todos os cenários batem com R$ 700/sem, R$ 100/dia e o piso de 50 conv/semana",
    scenarios.length >= 3 && inconsistent.length === 0,
    inconsistent.map((s) => `cpl=${s?.cplBrl}: ${JSON.stringify(s?.result)}`).join(" | "),
  );
  t(
    "Arvo: acima do break-even os cenários NÃO saem do aprendizado (verba insuficiente)",
    scenarios.filter((s) => s?.cplBrl > sizing.break_even_cpl_brl).every((s) => s?.result?.exitsLearning === false && s?.result?.verdict === "verba_insuficiente"),
    JSON.stringify(scenarios.filter((s) => s?.cplBrl > sizing.break_even_cpl_brl).map((s) => ({ cpl: s?.cplBrl, verdict: s?.result?.verdict }))),
  );
  t(
    "Arvo: learningNote cita R$ 700/semana e o CPL alvo de R$ 14",
    /700/.test(String(arvo?.generated?.skeleton?.learningNote ?? "")) && /\b14\b/.test(String(arvo?.generated?.skeleton?.learningNote ?? "")),
    JSON.stringify(arvo?.generated?.skeleton?.learningNote),
  );

  // Spin: coerência análoga da verba (R$ 60/dia = R$ 420/sem = 6000 centavos)
  const spinBudget = spin?.refresh_2026_07?.budget_note ?? {};
  t(
    "Spin: verba coerente (R$ 60/dia = R$ 420/sem = 6000 centavos na campanha)",
    spin?.budget?.daily_brl === 60 &&
      spinBudget.daily_brl === 60 &&
      spinBudget.weekly_brl === 420 &&
      spinBudget.weekly_brl === spinBudget.daily_brl * 7 &&
      spin?.campaign?.daily_budget_cents === 6000,
    `spin.budget=${JSON.stringify(spin?.budget?.daily_brl)} note=${JSON.stringify(spinBudget)} cents=${spin?.campaign?.daily_budget_cents}`,
  );
}

// --------------------------------------------------------------------------
console.log(`\n${pass}/${pass + fail} casos ok`);
if (fail) console.error(`${fail} caso(s) falharam — propostas Arvo/Spin fora da garantia.`);
process.exit(fail ? 1 : 0);
