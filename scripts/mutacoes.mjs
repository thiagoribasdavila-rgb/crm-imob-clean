#!/usr/bin/env node
/**
 * MUTATION TESTING — a suíte protege mesmo, ou só parece?
 *
 * ── Por que isto existe ─────────────────────────────────────────────────────
 *
 * Suíte verde não prova nada sozinha. Muitos contratos deste repositório leem o
 * ARQUIVO FONTE e casam uma regex — provam que alguém escreveu certo texto, não
 * que o comportamento acontece.
 *
 * A primeira execução disto, em 2026-07-27, encontrou três pontos cegos reais
 * entre 14 quebras deliberadas:
 *
 *   · desligar a leitura do "caminho" na tela → suíte verde (o grep casava com
 *     o texto que sobrava morto dentro do bloco);
 *   · tornar o motivo do descarte opcional → suíte verde (a constante
 *     continuava no arquivo, inalcançável);
 *   · fazer `orientar()` perder o mapa das recusas → suíte verde (nenhum teste
 *     chamava a função; todos liam o objeto direto).
 *
 * Os três estavam entre as coisas que tinham acabado de ser declaradas
 * "protegidas por contrato". Daí a ferramenta.
 *
 * ── Como funciona ───────────────────────────────────────────────────────────
 *
 * Copia o repositório para uma pasta temporária, aplica UMA quebra por vez no
 * código de PRODUÇÃO, roda a suíte, e desfaz. Se a suíte continuar verde, aquele
 * comportamento não está protegido.
 *
 * O repositório de trabalho NUNCA é tocado: tudo acontece na cópia.
 *
 * ── Como manter ─────────────────────────────────────────────────────────────
 *
 * Ao proteger um comportamento novo com contrato, acrescente aqui a quebra
 * correspondente. Se ela sobreviver, o contrato é decorativo.
 *
 *   npm run teste:mutacoes
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, symlinkSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const ORIGEM = process.cwd();

/**
 * Cada mutação desfaz UM comportamento que a suíte declara proteger.
 * `dor` é o que o usuário sente se isso for para produção sem ninguém ver.
 */
const MUTACOES = [
  {
    id: "M01", arquivo: "lib/crm/pipeline-guidance.ts",
    quebra: "orientar() perde o mapa das recusas da rota",
    dor: "Toda recusa vira a frase genérica — inclusive a lead de outra carteira, e o beco volta.",
    de: `  if (RECUSAS_DA_ROTA[texto]) return RECUSAS_DA_ROTA[texto];`,
    para: `  if (false) return GENERICA;`,
  },
  {
    id: "M02", arquivo: "lib/security/api-auth.ts",
    quebra: "a recusa de perfil inativo volta a ser 'Perfil inativo.'",
    dor: "Usuário novo recebe HTTP 500 em 51 rotas em vez de saber que falta o diretor ativá-lo.",
    de: `    deny(request, "Seu acesso ainda não foi autorizado. Peça ao diretor para ativar seu usuário em Configurações › Usuários — é o passo que falta.");`,
    para: `    deny(request, "Perfil inativo.");`,
  },
  {
    id: "M03", arquivo: "app/api/v1/pipeline/route.ts",
    quebra: "o desfazer volta a procurar só em pipeline_history",
    dor: "O aviso 'Desfazer movimentação' aparece e o botão nunca funciona.",
    de: `        admin.from("pipeline_stage_moves")`,
    para: `        admin.from("pipeline_history")`,
  },
  {
    id: "M04", arquivo: "lib/crm/contact-attempts.ts",
    quebra: "podeDescartar volta a ser sempre falso",
    dor: "O corretor não consegue descartar lead nenhuma.",
    de: `    podeDescartar: !HA_PISO || jaRespondeu || total >= TENTATIVAS_MINIMAS,`,
    para: `    podeDescartar: false,`,
  },
  {
    id: "M05", arquivo: "app/(crm)/pipeline/page.tsx",
    quebra: "a tela para de alimentar o aviso com o caminho",
    dor: "O corretor lê o erro e não recebe o próximo passo. Volta a adivinhar.",
    de: `        if (recusa.caminho) setCaminho({ texto: recusa.caminho, acao: recusa.acao });`,
    para: `        if (false) setCaminho({ texto: recusa.caminho, acao: recusa.acao });`,
  },
  {
    id: "M06", arquivo: "app/api/v1/pipeline/route.ts",
    quebra: "lead de outra carteira volta a ser 409 em vez de 403",
    dor: "A tela trata como disputa de versão e sugere 'tente de novo' — laço sem fim.",
    de: `        foraDoEscopo ? 403 : naoEncontrada ? 404 : 409,`,
    para: `        naoEncontrada ? 404 : 409,`,
  },
  {
    id: "M07", arquivo: "lib/crm/pipeline-guidance.ts",
    quebra: "o caminho da lead fora de escopo vira 'atualize o Kanban'",
    dor: "O beco original: ele atualiza para sempre e a lead nunca muda de dono.",
    de: `    caminho: "Atualizar não resolve: peça a transferência ao seu gestor ou ao diretor. Enquanto ela não for sua, o Atlas não deixa mover.",
    acao: "falar-com-gestor",
  },
  pipeline_lead_not_found: {`,
    para: `    caminho: "Atualize o Kanban e confira a etapa atual antes de tentar novamente.",
    acao: "atualizar",
  },
  pipeline_lead_not_found: {`,
  },
  {
    id: "M08", arquivo: "app/(crm)/pipeline/page.tsx",
    quebra: "window.prompt volta a pedir a justificativa de compra",
    dor: "Navegador pode bloquear a caixa; texto curto é descartado sem aviso.",
    de: `    const followUpDescription = followUp?.trim() || "";`,
    para: `    const followUpDescription = followUp?.trim() || window.prompt("Descreva:") || "";`,
  },
  {
    id: "M09", arquivo: "app/(crm)/pipeline/page.tsx",
    quebra: "a tela volta a mostrar frase fixa no lugar do erro da rota",
    dor: "Toda recusa vira a mesma frase. O corretor não sabe o que faltou.",
    de: `        throw new Error(recusa.erro);`,
    para: `        throw new Error("A movimentação não foi confirmada.");`,
  },
  {
    id: "M10", arquivo: "lib/crm/contact-attempts.ts",
    quebra: "TENTATIVAS_MINIMAS ignora o env e fica fixo em 0",
    dor: "A trava não volta mais: 'religa em uma linha de .env' passa a ser mentira.",
    de: `  const n = Number(process.env.ATLAS_TENTATIVAS_MINIMAS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;`,
    para: `  return 0;`,
  },
  {
    id: "M11", arquivo: "lib/crm/pipeline-guidance.ts",
    quebra: "uma etapa do funil perde o ponto de conhecimento",
    dor: "A coluna deixa de dizer o que fazer para a lead avançar.",
    de: `  visita: {
    significa: "Visita marcada ou já feita.",
    paraAvancar: "Depois da visita, faça a proposta enquanto a impressão está fresca.",
  },`,
    para: ``,
  },
  {
    id: "M12", arquivo: "app/(crm)/pipeline/page.tsx",
    quebra: "o Kanban para de mostrar o ponto de conhecimento",
    dor: "O conhecimento existe no código e não chega a quem trabalha.",
    de: `                  {!compact && conhecimentoDaEtapa(stage.key) ? (`,
    para: `                  {false ? (`,
  },
  {
    id: "M13", arquivo: "app/api/v1/leads/[id]/qualify/route.ts",
    quebra: "uma rota volta a mandar recusa de autorização para 500",
    dor: "O usuário inativo recebe 'erro de servidor' naquela rota.",
    de: `|autoriz/i.test(message)`,
    para: `/i.test(message)`,
  },
  {
    id: "M14", arquivo: "app/api/v1/pipeline/route.ts",
    quebra: "o motivo do descarte deixa de ser obrigatório",
    dor: "Lead some do funil sem nada voltar para a Meta como sinal.",
    de: `    if (stage === "perdido" && !reversalOf && !discardReason) {`,
    para: `    if (false) {`,
  },
];

const copia = mkdtempSync(path.join(tmpdir(), "atlas-mut-"));
process.on("exit", () => { try { rmSync(copia, { recursive: true, force: true }); } catch { /* melhor esforço */ } });

console.log(`Copiando o repositório para ${copia} (o original não é tocado)...`);
execSync(
  `rsync -a --exclude node_modules --exclude .next --exclude dist --exclude .git ./ ${JSON.stringify(copia)}/`,
  { cwd: ORIGEM, stdio: "inherit" },
);
symlinkSync(path.join(ORIGEM, "node_modules"), path.join(copia, "node_modules"));

function falhasDaSuite() {
  try {
    const saida = execSync("npm run test:contracts 2>&1", { cwd: copia, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    return Number(saida.match(/ℹ fail (\d+)/)?.[1] ?? -1);
  } catch (e) {
    const saida = String(e.stdout || "") + String(e.stderr || "");
    return Number(saida.match(/ℹ fail (\d+)/)?.[1] ?? 999);
  }
}

console.log("Confirmando que a suíte está verde antes de mutar...");
const base = falhasDaSuite();
if (base !== 0) {
  console.error(`A suíte já falha (${base}) sem nenhuma mutação. Corrija antes de medir.`);
  process.exit(2);
}

const sobreviventes = [];
const naoAplicadas = [];
let pegas = 0;

for (const m of MUTACOES) {
  const alvo = path.join(copia, m.arquivo);
  if (!existsSync(alvo)) { naoAplicadas.push({ ...m, porque: "arquivo não existe" }); continue; }
  const original = readFileSync(alvo, "utf8");
  if (!original.includes(m.de)) {
    // O código mudou de forma. Não é falha da suíte — é a mutação ficando
    // obsoleta, e ela precisa ser reescrita para continuar valendo.
    naoAplicadas.push({ ...m, porque: "o trecho não existe mais — reescreva a mutação" });
    continue;
  }
  writeFileSync(alvo, original.replace(m.de, m.para));
  const falhas = falhasDaSuite();
  writeFileSync(alvo, original);

  if (falhas > 0) { pegas++; console.log(`${m.id}  ✔ PEGA (${falhas} teste[s]) — ${m.quebra}`); }
  else {
    sobreviventes.push(m);
    console.log(`${m.id}  ✘ SOBREVIVEU — ${m.quebra}`);
    console.log(`         dor: ${m.dor}`);
  }
}

const aplicadas = pegas + sobreviventes.length;
console.log(`\n${"═".repeat(72)}`);
console.log(`MUTATION SCORE: ${pegas}/${aplicadas} quebras detectadas`);

if (naoAplicadas.length) {
  console.log(`\n${naoAplicadas.length} mutação(ões) obsoleta(s) — o código mudou de forma:`);
  for (const n of naoAplicadas) console.log(`  ${n.id} ${n.arquivo} — ${n.porque}`);
}

if (sobreviventes.length) {
  console.log(`\nPONTOS CEGOS — a suíte fica verde com isto quebrado:\n`);
  for (const s of sobreviventes) console.log(`  ${s.id} ${s.quebra}\n       → ${s.dor}\n`);
  console.log("Um teste que passa com a funcionalidade quebrada é pior que nenhum:");
  console.log("produz confiança falsa. Torne a asserção comportamental.\n");
  process.exit(1);
}

console.log("\nNenhum ponto cego: toda quebra deliberada foi detectada.");
