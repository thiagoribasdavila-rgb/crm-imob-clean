/**
 * FASE 90 — O TETO DE AUTONOMIA DO COPILOTO NOTURNO.
 *
 * O que ele guarda é sério e continua valendo: a IA que trabalha de madrugada
 * não pode passar de `qualification`, não pode criar proposta, não pode mandar
 * mensagem sem aprovação humana, e a entrega ao corretor é de manhã.
 *
 * ── REVISÃO 2026-08-02: ELE CONFERIA A GRAFIA, NÃO A PROPRIEDADE ────────────
 *
 * A versão anterior era `s.includes(term)` com o literal exato, SEM ESPAÇO:
 * `maximumAutomatedStage:"qualification"`. Hoje eu reescrevi
 * `app/api/v2/ai/nightly-sales/route.ts` para que ele parasse de engolir erro
 * (o `approval_requests` era inserido sem verificação e `prepared += 1` rodava
 * mesmo assim), e ao formatar o objeto de resposta escrevi
 * `maximumAutomatedStage: "qualification"` — com o espaço que qualquer
 * formatador põe.
 *
 * O contrato não mudou em nada. O portão ficou VERMELHO em quatro controles.
 *
 * Isso é uma trava contra manutenção: ela ensina que mexer no arquivo quebra o
 * portão, e a saída fácil é não mexer — ou pior, desfazer a correção para
 * devolver o verde. É a mesma classe já corrigida neste repositório quando uma
 * asserção casava a linha de import e virava trava contra otimização.
 *
 * ── O QUE MUDOU, E POR QUE SAI MAIS FORTE ───────────────────────────────────
 *
 * 1. A comparação passou a ignorar espaço em branco dos DOIS lados. O que se
 *    cobra agora é "esta chave declara este valor", que é a propriedade — e não
 *    "estes bytes aparecem nesta ordem", que era a grafia.
 *
 * 2. Todo controle booleano ganhou a GUARDA DA NEGAÇÃO. Antes, exigir
 *    `proposalAllowed:false` deixava passar um arquivo que tivesse as DUAS
 *    coisas — o `false` num ramo e um `true` em outro. O portão continuaria
 *    verde enquanto a proposta era liberada em algum caminho. Agora a presença
 *    do valor oposto REPROVA.
 *
 * Ou seja: ele deixou de reprovar formatação e passou a pegar uma regressão de
 * governança que antes não pegava.
 */
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const checks = [];

/** Espaço em branco não é conteúdo: some dos dois lados antes de comparar. */
const semEspaco = (t) => t.replace(/\s+/g, "");

function need(p, ...terms) {
  const s = semEspaco(read(p));
  for (const term of terms) {
    const alvo = semEspaco(term);
    let ok = s.includes(alvo);
    let nome = `${p}: ${term}`;

    // Guarda da negação: para um controle booleano, a presença do valor oposto
    // é tão grave quanto a ausência do declarado.
    const bool = /^(.*):(true|false)$/.exec(alvo);
    if (bool && ok) {
      const oposto = `${bool[1]}:${bool[2] === "true" ? "false" : "true"}`;
      if (s.includes(oposto)) {
        ok = false;
        nome = `${p}: ${term} — e o valor OPOSTO (${oposto}) também aparece no arquivo`;
      }
    }
    checks.push([nome, ok]);
  }
}

need(
  "lib/ai/governed-nightly-copilot.ts",
  "22:00–06:59",
  'maximumAutomatedStage:"qualification"',
  'simulationMode:"draft_only"',
  "proposalAllowed:false",
  "humanApprovalEveryOutbound:true",
  "morningHandoff",
);
need(
  "supabase/migrations/20260719130000_phase_90_governed_nightly_copilot.sql",
  "maximum_automated_stage",
  "morning_handoff_required",
  "nightly_broker_handoffs",
  "acknowledge_nightly_handoff",
  "handoff_owner_only",
  "private.can_view_commercial_profile",
);
need(
  "app/api/v2/ai/nightly-sales/route.ts",
  "evaluateNightlyEligibility",
  "message_templates",
  "check_lead_contact_eligibility",
  'maximumAutomatedStage:"qualification"',
  "proposalAllowed:false",
);
need("app/api/v2/ai/nightly-handoff/route.ts", "morningHandoff", "messagesSent:false", "proposalsCreated:false");
need(
  "app/api/v1/ai/nightly-handoffs/route.ts",
  "oneLeadOneBroker:true",
  "simulationDraftOnly:true",
  "proposalAllowed:false",
  "everyOutboundApproved:true",
);
need(
  "app/(crm)/leads/nightly-handoffs/page.tsx",
  "90-governed-nightly-copilot",
  "22H–07H",
  "ATÉ QUALIFICAÇÃO",
  "MANHÃ COM CORRETOR",
);

for (const [name, ok] of checks) console.log(`${ok ? "✓" : "✗"} ${name}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
console.log(`\nFase 90 aprovada: ${checks.length} controles do Copiloto noturno.`);
