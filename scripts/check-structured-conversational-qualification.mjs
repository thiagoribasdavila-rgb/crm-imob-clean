/**
 * Portão da Fase 86 — qualificação conversacional estruturada.
 *
 * ── REAPONTAMENTO EM 2026-07-29 ─────────────────────────────────────────────
 *
 * Até hoje este portão cobrava as três promessas da fase procurando os RÓTULOS
 * em caixa alta na tela de qualificação:
 *
 *     "UMA PERGUNTA POR VEZ" · "CORRETOR CONFIRMA" · "CONVERSA BRUTA: ZERO"
 *
 * MEDIDO: esses rótulos eram três `<AtlasBadge>` de um hero de marketing,
 * apagado DE PROPÓSITO no commit 2c059a79 a pedido literal do dono ("essa parte
 * intuitiva de facil preenchimento"), porque o hero empurrava a pergunta para
 * baixo da dobra no mobile. `git log -S` confirma: as frases entraram em
 * 62cabe58 (entrega da fase) e saíram em 2c059a79 (refino de usabilidade).
 * A tela está byte a byte idêntica ao HEAD — ninguém quebrou nada. O
 * COMPORTAMENTO nunca saiu; saiu o cartaz que o anunciava.
 *
 * O requisito NÃO é invenção de agente: está escrito em
 * `docs/STRUCTURED_CONVERSATIONAL_QUALIFICATION_PHASE_86.md` — "O Atlas sugere
 * uma pergunta por vez... confirma apenas uma resposta controlada...
 * [transcrição, áudio, mensagem] não são armazenados". O requisito é de
 * COMPORTAMENTO; o portão o media por COPY.
 *
 * Procurar o cartaz é a pior guarda possível nos dois sentidos: aprovaria uma
 * tela que perdeu a funcionalidade e só manteve o texto, e reprovava — como
 * reprovava — uma tela que tem a funcionalidade inteira e trocou o texto.
 *
 * Agora o portão cobra o comportamento, e a cobrança executável (256 estados de
 * perfil, os dois lados de cada regra) vive em
 * `tests/contracts/uma-pergunta-por-vez.test.mjs`, coberta por mutação
 * (M78–M82). Este arquivo é a rede estática; o contrato é a prova.
 */

import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const checks = [];

/**
 * Asserção que casa a linha do `import` não prova que o código USA aquilo, e um
 * comentário que EXPLICA o proibido não pode reprovar o arquivo que o explica.
 */
const semRuido = (fonte) =>
  fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*import\b/.test(l))
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

function need(p, ...terms) {
  const s = read(p);
  for (const term of terms) checks.push([`${p}: ${term}`, s.includes(term)]);
}

/** Ancora na REGIÃO do arquivo, nunca numa linha: a fonte aqui é minificada. */
function needBehavior(p, ...regras) {
  const s = semRuido(read(p));
  for (const [rotulo, prova] of regras) checks.push([`${p}: ${rotulo}`, Boolean(prova(s))]);
}

need(
  "lib/ai/conversational-qualification.ts",
  "QUALIFICATION_FIELDS",
  "qualificationProgress",
  "nextQuestion",
  "readyForPresentation",
);
need(
  "supabase/migrations/20260719110000_phase_86_structured_conversational_qualification.sql",
  "lead_qualification_profiles",
  "lead_qualification_events",
  "record_structured_qualification",
  "qualification_owner_only",
  "sync_qualification_owner",
  "rawConversationStored",
  "private.can_view_lead",
  "qualificationAnswers",
);
need(
  "app/api/v1/leads/[id]/conversational-qualification/route.ts",
  "structuredOnly:true",
  "oneQuestionAtATime:true",
  "brokerConfirmation:true",
  "rawConversationStored:false",
  "noAutomaticInference:true",
);
need("app/api/ai/copilot/route.ts", "lead_qualification_profiles", "qualificationProgress");

/**
 * ── REAPONTAMENTO EM 2026-08-02: `brokerConfirmed: true` ────────────────────
 *
 * Este portão exigia a string literal `brokerConfirmed: true` no copiloto. A
 * promessa da fase é "o corretor confirma"; a asserção media um LITERAL.
 *
 * MEDIDO na base viva em 02/08/2026: o copiloto lia só
 * `lead_qualification_profiles`, que tem 3 linhas para 490 leads. Das 15 leads
 * que responderam em `/qualify`, 13 não têm linha lá — para essas o copiloto
 * escrevia sem objetivo, prazo nem forma de pagamento, dados que estavam
 * gravados na outra gaveta. Unindo as fontes, 178 leads passaram a ter sinal
 * (487 → 309 leads em zero), e parte deles veio do anúncio ou do cadastro, não
 * de confirmação do corretor.
 *
 * Nesse cenário o literal `true` VIRA MENTIRA — e, pior, o portão obrigaria a
 * mantê-la: seria um portão congelando o defeito. A asserção foi REAPONTADA
 * para a propriedade que a promessa realmente quer, e sai mais forte:
 *
 *   · `brokerConfirmed` tem de ser DERIVADO da origem de cada sinal;
 *   · `true` cravado passa a ser PROIBIDO (antes era obrigatório);
 *   · a memória comercial só recebe o recorte confirmado dentro do CRM, que é
 *     o que sustenta "prazo e pagamento nunca entram sem confirmação".
 *
 * A prova executável dos dois lados vive em
 * `tests/contracts/uma-gaveta-de-qualificacao.test.mjs`.
 */
needBehavior("app/api/ai/copilot/route.ts", [
  "CORRETOR CONFIRMA (a bandeira é DERIVADA da origem, nunca cravada)",
  (s) =>
    !/brokerConfirmed:\s*true\b/.test(s) &&
    /brokerConfirmed:\s*Object\.values\(unificada\.origens\)\.every\(\s*\(origem\)\s*=>\s*origem\s*===\s*"corretor"\s*\)/.test(s) &&
    /confirmedQualification\s*=\s*perfilConfirmadoNoCrm\(unificada\)/.test(s),
]);

// A pergunta seguinte nasce de UMA lacuna, e para quando não há lacuna.
needBehavior("lib/ai/conversational-qualification.ts", [
  "UMA PERGUNTA POR VEZ (a próxima é a PRIMEIRA lacuna, ou nenhuma)",
  (s) => /nextField\s*=\s*missing\[0\]\s*\|\|\s*null/.test(s),
]);

// A resposta é escolhida de um catálogo, e a recusa vem ANTES da gravação.
needBehavior("app/api/v1/leads/[id]/conversational-qualification/route.ts", [
  "CORRETOR CONFIRMA (só o responsável pela lead)",
  (s) => /canAnswer:\s*lead\.assigned_to\s*===\s*access\.access\.profile\.id/.test(s),
], [
  // A guarda e o seu `return` têm de ser ADJACENTES: `\s*` atravessa reflow,
  // mas não sobrevive a um `if (false)` no meio nem ao código renomeado. Medir
  // só a ORDEM de duas ocorrências deixou passar um `QUALIFICATION_INVALID_X`
  // inalcançável — `indexOf` casa o prefixo de um identificador renomeado.
  "RESPOSTA CONTROLADA (catálogo recusa antes de gravar)",
  (s) => {
    const post = s.slice(s.indexOf("export async function POST"));
    return (
      /if\s*\(\s*!\(\s*field in options\s*\)\s*\|\|\s*!options\[[^\]]*\]\.includes\(\s*value\s*\)\s*\)\s*return\s+apiError\(\s*"QUALIFICATION_INVALID"/.test(post) &&
      post.indexOf('"QUALIFICATION_INVALID"') < post.indexOf("record_structured_qualification")
    );
  },
], [
  "CONVERSA BRUTA: ZERO (o corpo aceito é só campo/valor)",
  (s) => /field\?\s*:\s*string;\s*value\?\s*:\s*string/.test(s) && !/transcript|audio|raw_conversation|message_body|free_text/i.test(s),
]);

needBehavior("app/(crm)/leads/[id]/qualification/page.tsx", [
  "UMA PERGUNTA POR VEZ (um campo ativo, não o formulário inteiro)",
  (s) =>
    /data\.options\[activeField\]/.test(s) &&
    /activeField\s*=\s*editing\s*\?\?\s*nextField/.test(s) &&
    !/QUALIFICATION_FIELDS\.map|Object\.keys\(\s*(data\.)?options\s*\)\.map|Object\.entries\(\s*data\.options\s*\)\.map/.test(s),
], [
  // Procurar `disabled={busy||!data.canAnswer}` no arquivo NÃO prova que o botão
  // que grava está travado: a tela tem DOIS gatilhos de escrita, e desarmar um
  // deles deixava o outro satisfazendo a busca. Cada gatilho é medido no seu
  // próprio trecho.
  "CORRETOR CONFIRMA (TODO gatilho de escrita travado, não só um)",
  (s) => {
    const gatilhos = ["void pick(", "setEditing(field)"];
    return gatilhos.every((g) => {
      const i = s.indexOf(g);
      return i > 0 && /!data\.canAnswer/.test(s.slice(Math.max(0, i - 260), i));
    });
  },
], [
  "CONVERSA BRUTA: ZERO (nenhuma porta de texto livre na tela)",
  (s) => !/<textarea/i.test(s) && !/<input/i.test(s) && !/contentEditable/i.test(s) && /<button/.test(s),
]);

need("app/(crm)/leads/[id]/qualification/page.tsx", "86-structured-conversational-qualification");

// O requisito tem de continuar ESCRITO: se o documento perder a frase, o portão
// vira um agente cobrando de si mesmo — foi o risco que causou o reapontamento.
needBehavior("docs/STRUCTURED_CONVERSATIONAL_QUALIFICATION_PHASE_86.md", [
  "REQUISITO ESCRITO (o documento da fase pede as três promessas)",
  (s) =>
    /uma pergunta por vez/i.test(s) &&
    /confirma apenas uma resposta controlada/i.test(s) &&
    /não são armazenados/i.test(s),
]);

// A prova executável não pode desaparecer sem alguém notar.
needBehavior("package.json", [
  "PROVA EXECUTÁVEL (o contrato de comportamento existe)",
  () => fs.existsSync("tests/contracts/uma-pergunta-por-vez.test.mjs"),
]);

for (const [name, ok] of checks) console.log(`${ok ? "✓" : "✗"} ${name}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
console.log(`\nFase 86 aprovada: ${checks.length} controles de qualificação conversacional.`);
