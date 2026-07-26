/**
 * Teste adversarial do REGISTRO DE PRIMEIRO CONTATO EM 1 CLIQUE.
 *
 * O que este portão protege é uma cadeia inteira, e não um arquivo:
 *
 *   trigger carimba o prazo -> GET da ficha expõe o prazo -> corretor clica um
 *   botão -> POST fecha o relógio -> a medição volta para a tela.
 *
 * A cadeia já foi quebrada uma vez de um jeito silencioso: a rota de registro
 * existia, estava correta e provada no banco — e NENHUMA tela a chamava. O
 * resultado medido foram 210 leads ativas com 0 contatos registrados, que se
 * lia como "a equipe não atende" quando era "o sistema não tem como registrar".
 * Um teste que olhasse só a rota, ou só a tela, teria passado o tempo inteiro.
 *
 * Por isso os casos abaixo verificam as PONTAS e a LIGAÇÃO entre elas, além das
 * três regras que impedem a métrica de mentir:
 *   1. a leitura do SLA degrada em banco sem as colunas (42703), em vez de
 *      derrubar a ficha inteira;
 *   2. "não dá para medir" nunca é apresentado como "ninguém contatou";
 *   3. recontato não se declara primeiro contato nem reescreve a medição.
 *
 * 100% determinístico: só lê arquivos do repo. Sem rede, sem banco, sem relógio.
 *
 * Rodar da raiz do repo: node scripts/check-first-contact-capture.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const p = (...partes) => path.join(root, ...partes);

const COMPONENTE = p("components", "crm", "first-contact-quick-log.tsx");
const BARRA = p("components", "crm", "lead-operational-bar.tsx");
const PAGINA = p("app", "(crm)", "leads", "[id]", "page.tsx");
const ROTA_REGISTRO = p("app", "api", "v1", "leads", "[id]", "first-contact", "route.ts");
const ROTA_FICHA = p("app", "api", "v1", "leads", "[id]", "route.ts");
const COMPAT = p("lib", "compat", "legacy-v2.ts");
const CSS = p("app", "globals.css");

// Precisa casar a CHAMADA, não qualquer menção. O caminho do import
// ("@/components/crm/first-contact-quick-log") contém "/first-contact" e fazia
// o caso 8 passar mesmo com a chamada apagada — o teste do teste pegou isso.
const CHAMADA_DE_REGISTRO = /\/api\/v1\/leads\/[^`"']*\/first-contact/;

const falhas = [];
let passaram = 0;
const check = (nome, ok, detalhe = "") => {
  if (ok) passaram += 1;
  else falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};

const ler = (caminho) => (fs.existsSync(caminho) ? fs.readFileSync(caminho, "utf8") : null);

const componente = ler(COMPONENTE);
const barra = ler(BARRA);
const pagina = ler(PAGINA);
const rotaRegistro = ler(ROTA_REGISTRO);
const rotaFicha = ler(ROTA_FICHA);
const compat = ler(COMPAT);
const css = ler(CSS);

// --- as pontas existem -------------------------------------------------------
check("caso 1: componente de registro em 1 clique existe", Boolean(componente), "components/crm/first-contact-quick-log.tsx ausente");
check("caso 2: rota de registro existe", Boolean(rotaRegistro), "app/api/v1/leads/[id]/first-contact/route.ts ausente");
check("caso 3: rota da ficha existe", Boolean(rotaFicha));

if (rotaRegistro) {
  // Menção em comentário não fecha relógio nenhum: exige a CHAMADA da RPC.
  check(
    "caso 4: a rota fecha o relógio pela RPC dedicada",
    /\.rpc\(\s*["']complete_first_contact_sla["']/.test(rotaRegistro),
    "a rota não CHAMA complete_first_contact_sla — o SLA ficaria aberto para sempre",
  );
  check("caso 5: a rota grava o contato na linha do tempo real", rotaRegistro.includes("recordLiveLeadEvent"), "sem evento em lead_events o histórico comercial some");
  check(
    "caso 6: a rota degrada em banco sem a medição (42883/PGRST202) em vez de perder o registro",
    rotaRegistro.includes("42883") && rotaRegistro.includes("PGRST202"),
    "sem detectar RPC ausente, banco legado perde o registro do contato",
  );
  check("caso 7: só o primeiro contato fecha o SLA", /jaContatada/.test(rotaRegistro) && /if \(!jaContatada\)/.test(rotaRegistro), "recontato reescreveria a medição original");
}

// --- a ligação: a tela realmente chama a rota -------------------------------
if (pagina) {
  check(
    "caso 8: a página do lead chama POST na rota de registro",
    CHAMADA_DE_REGISTRO.test(pagina) && /method:\s*"POST"/.test(pagina),
    "a rota existe mas nenhuma tela a chama — foi exatamente assim que a métrica ficou zerada",
  );
  check("caso 9: a página monta o componente de 1 clique", pagina.includes("FirstContactQuickLog"), "componente não montado na ficha");
  check(
    "caso 10: o registro fica na barra sticky, não perdido no rolar da página",
    /firstContactSlot=\{/.test(pagina),
    "fora da barra operacional o botão sai de vista e deixa de ser usado",
  );
  check("caso 11: a página consome o bloco firstContactSla da API", pagina.includes("firstContactSla"), "sem o prazo a tela não sabe mostrar urgência");
}

if (barra) {
  check("caso 12: a barra operacional aceita e renderiza o slot de primeiro contato", barra.includes("firstContactSlot"), "slot ausente na barra");
}

// --- leitura do SLA sem derrubar banco legado -------------------------------
if (compat) {
  check(
    "caso 13: as colunas de SLA ficam fora do select base",
    compat.includes("FIRST_CONTACT_SLA_COLUMNS") && compat.includes("LIVE_LEAD_SELECT_WITH_SLA"),
    "sem select estendido separado, banco legado quebra com 42703 em toda rota",
  );
  const baseIsolada = /export const LIVE_LEAD_SELECT = \[[\s\S]*?\]\.join\(","\);/.exec(compat)?.[0] ?? "";
  check(
    "caso 14: o select base NÃO contém coluna de SLA",
    !/first_contact_due_at|first_contacted_at|first_contact_sla_met/.test(baseIsolada),
    "colocar SLA no select base derruba toda rota que o usa em banco sem a fase 34",
  );
}

if (rotaFicha) {
  check(
    "caso 15: a ficha tenta o select com SLA e cai para o base em 42703",
    rotaFicha.includes("LIVE_LEAD_SELECT_WITH_SLA")
      && /isMissingColumn\(\s*leadError\s*\)/.test(rotaFicha)
      && rotaFicha.includes("LIVE_LEAD_SELECT"),
    "sem degradação, ligar o SLA derruba a ficha inteira em banco legado",
  );
  check(
    "caso 16: a ficha distingue 'não dá para medir' de 'ninguém contatou'",
    /mensuravel/.test(rotaFicha),
    "sem esse sinal, banco sem medição vira relatório de equipe que não atende",
  );
}

// --- a tela não pode inventar medição ---------------------------------------
if (componente) {
  check("caso 17: o componente é client component", componente.trimStart().startsWith('"use client"'), "sem \"use client\" os botões não respondem");
  check(
    "caso 18: os três resultados reais do corretor estão cobertos",
    /canal: "call", resultado: "falou"/.test(componente)
      && /canal: "whatsapp", resultado: "falou"/.test(componente)
      && /resultado: "sem_resposta"/.test(componente),
    "faltou ligou / whatsapp / sem resposta",
  );
  check(
    "caso 19: registrar é UM clique — sem formulário, sem campo obrigatório",
    !/<form/i.test(componente) && !/required/.test(componente),
    "qualquer campo obrigatório antes do registro mata a adesão e a métrica junto",
  );
  check(
    "caso 20: a tela não inventa zero quando não há medição",
    !/minutosDeResposta\s*\|\|\s*0/.test(componente) && !/\?\?\s*0\b/.test(componente),
    "zero fabricado vira 'respondido em 0 min' para lead nunca contatada",
  );
  check(
    "caso 21: o prazo é relógio vivo, não número congelado na renderização",
    componente.includes("setInterval"),
    "sem atualização o corretor lê 'vence em 4 min' de meia hora atrás",
  );
  check(
    "caso 22: estado vencido é sinalizado para o CSS",
    /data-vencido/.test(componente) && Boolean(css) && css.includes('.atlas-first-contact[data-vencido="true"]'),
    "sem destaque visual o atraso passa despercebido",
  );
}

// ---------------------------------------------------------------------------
console.log(`\ncheck-first-contact-capture: ${passaram} passaram, ${falhas.length} falharam.`);
if (falhas.length) {
  for (const f of falhas) console.error(`  FALHOU: ${f}`);
  process.exit(1);
}
