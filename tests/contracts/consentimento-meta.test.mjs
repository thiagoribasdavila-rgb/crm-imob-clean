/**
 * Contrato do CONSENTIMENTO META.
 *
 * Medido no banco vivo antes de escrever: 217 leads, TODAS com e-mail ou
 * telefone, sete já em etapa que dispara evento de conversão — e ZERO prontas
 * para enviar. Faltava uma coisa só, em todas: ninguém registrou consentimento.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");
const rota = ler("app", "api", "v1", "crm", "leads", "meta-consent", "route.ts");
const painel = ler("components", "crm", "meta-consent-control.tsx");
const lib = await import(
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(ler("lib", "crm", "meta-consent.ts")))}`
);

test("ausência NUNCA vira consentimento", () => {
  for (const md of [null, undefined, {}, { meta: {} }, { meta: { ad_id: "1" } }]) {
    assert.equal(lib.lerEstado(md), "nao_perguntado");
  }
});

test("a atribuição da lead é preservada ao gravar", () => {
  // Sobrescrever `meta` apagaria ad_id/form_id/campaign_id — a atribuição que
  // faz o funil por criativo funcionar.
  const antes = { meta: { ad_id: "120251113236390624", form_id: "999" }, outro: "x" };
  const d = lib.aplicarConsentimento(antes, { estado: "concedido", origem: "declarado_pelo_corretor", registradoPor: "p1" });
  assert.equal(d.meta.ad_id, "120251113236390624");
  assert.equal(d.meta.form_id, "999");
  assert.equal(d.outro, "x");
});

test("o booleano que o capi-window lê continua sendo gravado", () => {
  // Duas verdades sobre a mesma coisa é o defeito que este projeto vem
  // desfazendo: o estado é legível, o booleano é o que o envio consulta.
  const d = lib.aplicarConsentimento({}, { estado: "concedido", origem: "declarado_pelo_corretor", registradoPor: "p1" });
  assert.equal(d.meta.dataSharingConsent, true);
  const n = lib.aplicarConsentimento({}, { estado: "nao_perguntado", origem: "declarado_pelo_corretor", registradoPor: "p1" });
  assert.equal(n.meta.dataSharingConsent, false, "'não perguntei' não envia");
});

test("quem registrou e quando ficam gravados", () => {
  // "O sistema diz que sim" não é resposta numa fiscalização.
  const d = lib.aplicarConsentimento({}, { estado: "concedido", origem: "declarado_pelo_corretor", registradoPor: "perfil-1" });
  assert.equal(d.meta.registradoPor, "perfil-1");
  assert.ok(d.meta.registradoEm);
  assert.equal(d.meta.origem, "declarado_pelo_corretor");
});

/**
 * ── AS TRÊS ASSERÇÕES ABAIXO FORAM REAPONTADAS EM 2026-07-29 ────────────────
 *
 * Elas vigiavam a IMPLEMENTAÇÃO antiga: um `Set(["director"])` local na rota e um
 * estado `ehDiretor` derivado do JWT na tela. E cumpriram seu papel — foram elas
 * que pegaram a mudança e obrigaram esta explicação.
 *
 * Mas a segunda delas guardava o PRÓPRIO DEFEITO. O nome era "a tela decide pelo
 * papel da sessão, SEM CHAMADA EXTRA", e essa economia era a doença: o servidor
 * decidia pelo perfil (`commercialRole || role`, lido de `profiles`), a tela pelo
 * claim (`app_metadata.access_role`, lido do token). Fontes diferentes, regras
 * diferentes.
 *
 * MEDIDO rodando as duas derivações sobre as contas reais: das 3 com papel de
 * diretoria, DUAS divergiam — inclusive a do dono do produto. Elas viam os três
 * botões habilitados e levavam 403 ao clicar. A asserção antiga era satisfeita por
 * isso: ela provava que a tela decidia de ALGUM jeito, nunca que decidia do MESMO.
 *
 * O reapontamento deixa as três MAIS fortes: a regra virou módulo compartilhado e
 * a tela parou de decidir — ela PERGUNTA ao `GET`. O grão fino está em
 * tests/contracts/registro-de-consentimento.test.mjs, que EXECUTA a regra contra
 * as três formas reais de perfil.
 */
test("SÓ a diretoria registra — nem o dono da lead escapa", () => {
  // Consentimento não é observação sobre a lead: é declaração de base legal para
  // tratar dado pessoal de terceiro, e responsabilidade não se delega para quem
  // não tem como assumi-la.
  assert.match(rota, /podeRegistrarConsentimento\(identity\.access\.profile\)/,
    "a rota precisa CHAMAR a regra compartilhada, não reimplementá-la");
  assert.match(rota, /MOTIVO_SEM_REGISTRO/, "a frase da recusa vem do módulo, não duplicada aqui");
  assert.match(rota, /status: 403/);
  assert.ok(!/ehDono/.test(rota), "ser dono da lead deixou de bastar");
});

test("a tela não oferece o que a escrita vai negar", () => {
  // Era "a tela decide pelo papel da sessão". Decidir sozinha ERA o defeito:
  // o corretor descobria a regra levando 403 depois de clicar — que é justamente
  // o que a asserção antiga dizia estar evitando.
  assert.match(painel, /podeRegistrar/, "a tela precisa consumir a decisão do servidor");
  assert.match(painel, /const editavel = podeEditar \?\? podeRegistrar \?\? false;/,
    "o `?? false` é o que impede o botão de convidar sem poder");
  assert.match(painel, /meta-consent[\s\S]{0,400}Authorization/,
    "a tela precisa PERGUNTAR à rota, com a sessão, em vez de derivar do token");
});

test("falha de rede assume que NÃO pode", () => {
  // Falha fechada: errar para o lado de não oferecer é melhor que oferecer e o
  // servidor recusar. A regra não mudou — mudou de onde vem a resposta.
  assert.match(painel, /catch \{[\s\S]{0,300}setPodeRegistrar\(false\)/);
});

test("'formulario_meta' não pode ser marcado à mão", () => {
  // Essa base vem do webhook, quando a lead preencheu dentro da Meta. Deixar
  // marcar à mão transformaria base verificável em afirmação sem lastro.
  assert.match(rota, /`formulario_meta` não é\s*\n?\s*\/\/ aceito aqui|`formulario_meta` não é/);
  assert.match(rota, /"importado" : "declarado_pelo_diretor"/,
    "o registro manual é sempre declaração da diretoria — é ela que assina");
});

test("as três respostas existem, e 'não perguntei' é uma delas", () => {
  assert.deepEqual([...lib.ESTADOS].sort(), ["concedido", "nao_perguntado", "negado"]);
  assert.match(painel, /Ainda não perguntei/);
  assert.match(painel, /um "sim" que não aconteceu é pior/,
    "a razão de existir a terceira opção precisa estar escrita");
});

test("falha de rede DESFAZ o estado otimista", () => {
  // Mostrar "autorizado" para algo que não gravou é o pior erro possível aqui.
  assert.match(painel, /setEstado\(anterior\)/);
  assert.match(painel, /nada foi registrado/);
});

test("a tela diz a consequência de não registrar", () => {
  assert.match(painel, /não volta para otimizar a campanha/);
});

test("a ficha NÃO pergunta consentimento — a lead da Meta já vem com ele", () => {
  /**
   * ── REAPONTADO EM 2026-08-01, POR DECISÃO DO DONO DO PRODUTO ─────────────
   *
   * A asserção anterior exigia `<MetaConsentControl` na ficha. Ela existia por
   * um bom motivo — 217 leads sem consentimento registrado — e foi derrubada
   * por um fato melhor: **a lead que vem de um formulário da Meta já traz
   * consentimento.** O formulário mostra a política e o envio é voluntário.
   * Pedir de novo era pedir ao corretor que atestasse algo que ele não
   * presenciou.
   *
   * O produto já sabia disso antes da tela: `consentimentoDaFonte()` marca
   * `concedido` com origem `formulario_meta` na ingestão, quando a fonte tem a
   * cláusula de compartilhamento. A pergunta só aparecia para quem NÃO veio de
   * lá — como as leads importadas de planilha.
   *
   * Este contrato inverte, e sai MAIS FORTE: além de garantir que a ficha não
   * pergunta, passa a exigir que o caminho automático continue existindo. Sem
   * a segunda metade, alguém poderia remover `consentimentoDaFonte` e a lead da
   * Meta deixaria de ser enviável sem ninguém perceber.
   */
  const pagina = ler("app", "(crm)", "leads", "[id]", "page.tsx");
  assert.doesNotMatch(pagina, /<MetaConsentControl/,
    "a ficha voltou a perguntar consentimento — a lead da Meta já vem com ele");

  const fonte = ler("lib", "crm", "meta-consent.ts");
  assert.match(fonte, /export function consentimentoDaFonte/,
    "o caminho automático sumiu: sem ele, nenhuma lead nasce com consentimento");
  assert.match(fonte, /estado: temClausula \? "concedido"/,
    "a fonte com cláusula precisa continuar marcando `concedido` na ingestão");
  assert.match(fonte, /origem: temClausula \? "formulario_meta"/,
    "a origem precisa registrar QUE foi o formulário — é a prova da base legal");
});

test("a rota de correção continua existindo, fora do caminho do dia a dia", () => {
  // Tirar a pergunta da ficha não pode significar ficar sem jeito nenhum de
  // registrar ou desfazer consentimento — para lead que não veio de anúncio,
  // ou para corrigir um registro errado.
  const rota = ler("app", "api", "v1", "crm", "leads", "meta-consent", "route.ts");
  assert.match(rota, /export async function POST/);
  assert.match(rota, /SAVE_MATCHED_NOTHING/,
    "a rota precisa recusar quando o update não casa linha nenhuma");
});

// ── Assertivo para o corretor: só pede o que falta ─────────────────────────

test("lead já respondida não pede decisão de novo", () => {
  // 204 de 217 leads já têm consentimento. Três botões em todas elas é pedir
  // 204 reconfirmações — e é assim que se treina alguém a ignorar o painel.
  assert.match(painel, /const resolvido = estado !== "nao_perguntado";/);
  assert.match(painel, /if \(resolvido && !aberto\)/);
  assert.match(painel, /atlas-consent-resumo/);
});

test("resolvido continua alterável, sem estar no caminho", () => {
  assert.match(painel, /onClick=\{\(\) => setAberto\(true\)\}/);
  assert.match(painel, /· alterar/);
});

test("só o pendente pede atenção — é o único que bloqueia", () => {
  assert.match(painel, /data-pendente=\{!resolvido\}/);
  const css = ler("app", "globals.css");
  assert.match(css, /\.atlas-consent\[data-pendente="true"\]/);
  assert.match(css, /border-left: 2px solid var\(--atlas-warning\)/);
});

test("pendente pergunta, resolvido afirma", () => {
  // Título em pergunta convida a responder; em afirmação, só informa.
  assert.match(painel, /O cliente autorizou compartilhar os dados com a Meta\?/);
  assert.match(painel, /Enquanto você não responder, o resultado desta lead não volta/);
});
