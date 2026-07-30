/**
 * Contrato: A PRONTIDÃO NÃO PODE DIZER PRONTO O QUE NÃO FOI EXERCITADO.
 *
 * ── O DEFEITO QUE ISTO FIXA ─────────────────────────────────────────────────
 *
 * `/api/ready` publicava dois estados, `configured` e `not_configured`, e a
 * própria rota admitia em comentário que `configured` significa apenas "a
 * variável de ambiente existe". Quem lê a tela não lê o comentário.
 *
 * Medido em 2026-07-29, uma chamada mínima de leitura por provedor com as
 * credenciais reais do ambiente:
 *
 *   · OpenAI    `gpt-5.6-luna`      → HTTP 429 `insufficient_quota`
 *   · Anthropic `claude-sonnet-4-5` → HTTP 400 "credit balance is too low"
 *   · Perplexity `sonar`            → HTTP 200, 14 tokens
 *
 * Os três apareciam iguais: `configured`. E o `generativeReady` do briefing saía
 * de `Boolean(process.env.OPENAI_API_KEY)` — afirmava IA pronta pela existência
 * de uma variável, apontando para o único provedor generativo que não responde.
 *
 * O PIOR era o `smtp`: `checks.database.ok ? "via-supabase-auth" : "error"`.
 * Estado sobre E-MAIL derivado de uma consulta a `organizations`. Um status que
 * só fica vermelho quando OUTRO assunto cai nunca fica vermelho pelo próprio —
 * e o preço é recuperação de senha falhando em produção com a tela verde.
 *
 * ── POR QUE ESTE ARQUIVO EXECUTA, E NÃO FAZ GREP ────────────────────────────
 *
 * Porque grep no fonte da rota já sobreviveu a mutação neste repositório: trocar
 * `if (x)` por `if (false)` deixa a suíte verde enquanto a string continua no
 * arquivo, morta. A derivação vive em módulos puros — `estado-de-credencial.ts`,
 * `prontidao-das-integracoes.ts`, `prontidao-generativa.ts`, `model-profiles.ts`
 * — e aqui ela é chamada, com ambientes montados à mão e sem rede.
 *
 * As duas asserções que leem fonte estão marcadas como LIGAÇÃO: elas provam
 * apenas que a rota usa o módulo, porque rota de Next não é importável aqui.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  declararCredencial,
  estadoEhVerde,
  resumirDeclaracoes,
  ESTADOS_DE_CREDENCIAL,
  JANELA_DE_EVIDENCIA_MS,
} from "../../lib/integrations/estado-de-credencial.ts";
import {
  montarProntidaoDasIntegracoes,
  ASSUNTOS,
} from "../../lib/integrations/prontidao-das-integracoes.ts";
import {
  avaliarProntidaoGenerativa,
  evidenciasDeLinhasDeUso,
  MODELO_DE_FALLBACK,
  PROVEDOR_DE_FALLBACK,
} from "../../lib/ai/prontidao-generativa.ts";
import {
  problemaNoNomeDoModelo,
  problemaNaUrlBase,
  defeitosDeFormaDoAmbiente,
} from "../../lib/ai/model-profiles.ts";
import {
  lerRespostaDeProntidao,
  prontidaoEstaVerde,
} from "../../lib/integrations/leitura-da-prontidao.ts";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const AGORA = Date.parse("2026-07-29T20:00:00.000Z");
const HOJE = new Date(AGORA - 60_000).toISOString();

/** O ambiente real de homologação, reduzido ao que a prontidão lê. */
const AMBIENTE = {
  NEXT_PUBLIC_SUPABASE_URL: "https://pozbrcsfthnhmnebfoxv.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "chave-de-teste",
  META_APP_SECRET: "x",
  META_WEBHOOK_VERIFY_TOKEN: "x",
  META_LEAD_ACCESS_TOKEN: "x",
  META_CONVERSIONS_ACCESS_TOKEN: "x",
  ATLAS_META_CAPI_ENABLED: "true",
  WHATSAPP_ACCESS_TOKEN: "x",
  WHATSAPP_PHONE_NUMBER_ID: "x",
  OPENAI_API_KEY: "x",
  ANTHROPIC_API_KEY: "x",
  PERPLEXITY_API_KEY: "x",
  ATLAS_AI_MODEL: "gpt-5.6-luna",
  ATLAS_ANTHROPIC_MODEL: "claude-sonnet-4-5",
  ATLAS_RESEARCH_MODEL: "sonar",
};

const montar = (over = {}) =>
  montarProntidaoDasIntegracoes({
    env: { ...AMBIENTE, ...(over.env ?? {}) },
    evidencias: over.evidencias ?? [{ assunto: ASSUNTOS.banco, ok: true, em: HOJE }],
    defeitos: over.defeitos ?? {},
    agora: AGORA,
  });

// ──────────────────────────────────────────── os estados, um por um, executados

test("credencial ausente é AUSENTE e diz o que falta", () => {
  const d = declararCredencial({
    assunto: "whatsapp",
    presente: false,
    faltando: ["WHATSAPP_ACCESS_TOKEN"],
    agora: AGORA,
  });
  assert.equal(d.estado, "ausente");
  assert.equal(d.verificado, false);
  assert.match(d.motivo, /WHATSAPP_ACCESS_TOKEN/, "motivo sem o nome da variável não resolve nada");
});

test("credencial presente sem chamada real é CONFIGURADA_NAO_VERIFICADA — nunca verde", () => {
  const d = declararCredencial({ assunto: "openai", presente: true, agora: AGORA });
  assert.equal(d.estado, "configurada_nao_verificada");
  assert.equal(d.verificado, false);
  assert.equal(estadoEhVerde(d.estado), false, "era exatamente isto que `configured` fazia passar por verde");
});

test("chamada real bem-sucedida é VIVA, com data", () => {
  const d = declararCredencial({
    assunto: "perplexity",
    presente: true,
    evidencia: { assunto: "perplexity", ok: true, em: HOJE, detalhe: "sonar respondeu com 14 tokens" },
    agora: AGORA,
  });
  assert.equal(d.estado, "viva");
  assert.equal(d.verificado, true);
  assert.equal(d.verificadoEm, HOJE);
  assert.equal(estadoEhVerde(d.estado), true, "e o outro lado: quem responde de verdade TEM de ficar verde");
});

test("chamada real que falhou é QUEBRADA", () => {
  const d = declararCredencial({
    assunto: "anthropic",
    presente: true,
    evidencia: { assunto: "anthropic", ok: false, em: HOJE, detalhe: "HTTP 400 credit balance is too low" },
    agora: AGORA,
  });
  assert.equal(d.estado, "quebrada");
  assert.equal(d.verificado, false, "quebrada não é verificada-e-ok: o booleano de verde é só da viva");
  assert.match(d.motivo, /credit balance/);
});

test("defeito de forma na configuração é QUEBRADA sem gastar chamada", () => {
  const d = declararCredencial({
    assunto: "openai",
    presente: true,
    defeitoDeConfiguracao: 'ATLAS_AI_MODEL="gpt-5.6-" termina em separador — nome truncado',
    agora: AGORA,
  });
  assert.equal(d.estado, "quebrada");
  assert.match(d.motivo, /gpt-5\.6-/);
});

test("desligada de propósito é DESATIVADA — não é falha nem é ausente", () => {
  const d = declararCredencial({ assunto: "meta.capi", presente: true, desligadaPor: "ATLAS_META_CAPI_ENABLED", agora: AGORA });
  assert.equal(d.estado, "desativada");
  assert.notEqual(d.estado, "ausente", "confundir desligado com faltando manda o dono procurar credencial que ele não precisa");
});

test("verificado é verdadeiro SOMENTE em viva", () => {
  // O outro lado do booleano: sem isto, marcar tudo como verificado passaria nos
  // testes acima e recriaria o verde falso num campo novo.
  for (const estado of ESTADOS_DE_CREDENCIAL) {
    assert.equal(estadoEhVerde(estado), estado === "viva", `${estado} não pode contar como verde`);
  }
});

// ──────────────────────────────── a regra que mata a classe de bug do smtp

test("evidência de OUTRO assunto nunca produz VIVA — e a recusa sai declarada", () => {
  /**
   * O defeito exato: `smtp: checks.database.ok ? "via-supabase-auth" : "error"`.
   * Prova de que o BANCO respondeu sendo publicada como estado do E-MAIL.
   */
  const d = declararCredencial({
    assunto: "email",
    presente: true,
    evidencia: { assunto: "banco", ok: true, em: HOJE },
    agora: AGORA,
  });
  assert.notEqual(d.estado, "viva", "prova de um assunto não prova outro");
  assert.equal(d.estado, "configurada_nao_verificada");
  assert.equal(d.evidenciaDeOutroAssunto, "banco", "recusar em silêncio é o mesmo erro em outra forma");
  assert.match(d.motivo, /banco/, "o motivo tem de nomear a evidência recusada");
});

test("e o outro lado: evidência do MESMO assunto vale", () => {
  // Sem esta metade, recusar todas as evidências passaria no teste acima e
  // destruiria o produto: nada ficaria verde nunca.
  const d = declararCredencial({
    assunto: "email",
    presente: true,
    evidencia: { assunto: "email", ok: true, em: HOJE },
    agora: AGORA,
  });
  assert.equal(d.estado, "viva");
});

test("evidência fora da janela volta a NÃO VERIFICADA, com a data no motivo", () => {
  const velha = new Date(AGORA - JANELA_DE_EVIDENCIA_MS - 60_000).toISOString();
  const d = declararCredencial({
    assunto: "openai",
    presente: true,
    evidencia: { assunto: "openai", ok: true, em: velha },
    agora: AGORA,
  });
  assert.equal(d.estado, "configurada_nao_verificada", "sucesso de três semanas atrás não é sucesso de agora");
  assert.match(d.motivo, new RegExp(velha.slice(0, 10)));

  const dentro = new Date(AGORA - JANELA_DE_EVIDENCIA_MS + 60_000).toISOString();
  assert.equal(
    declararCredencial({ assunto: "openai", presente: true, evidencia: { assunto: "openai", ok: true, em: dentro }, agora: AGORA }).estado,
    "viva",
    "o outro lado: dentro da janela continua valendo, senão a janela zera tudo",
  );
});

test("evidência SEM DATA não conta como fresca", () => {
  /**
   * Sem data não há como avaliar frescor, e tratar "não sei quando" como "agora"
   * é a doença desta entrega em miniatura. O caminho existe porque a evidência
   * vem de uma tabela: linha com `created_at` nulo não pode virar verde eterno.
   */
  for (const em of [null, undefined, "", "ontem"]) {
    const d = declararCredencial({
      assunto: "openai",
      presente: true,
      evidencia: { assunto: "openai", ok: true, em },
      agora: AGORA,
    });
    assert.equal(d.estado, "configurada_nao_verificada", `em=${JSON.stringify(em)} não pode virar viva`);
    assert.equal(d.verificado, false);
  }
  // O outro lado: com data válida e dentro da janela, vale.
  assert.equal(
    declararCredencial({ assunto: "openai", presente: true, evidencia: { assunto: "openai", ok: true, em: HOJE }, agora: AGORA }).estado,
    "viva",
  );
});

// ─────────────────────── a invariância: o banco não colore mais nenhuma linha

test("virar o resultado do BANCO não muda NENHUMA outra integração", () => {
  /**
   * Este é o contrato central. Era o defeito do `smtp` e é a forma geral dele:
   * um estado derivado de uma checagem de outro assunto. Se alguém reapontar
   * qualquer linha para a checagem do banco, este teste fica vermelho.
   */
  const comBanco = montar({ evidencias: [{ assunto: ASSUNTOS.banco, ok: true, em: HOJE }] });
  const semBanco = montar({ evidencias: [{ assunto: ASSUNTOS.banco, ok: false, em: HOJE }] });

  assert.notDeepEqual(
    comBanco.integrations.supabase,
    semBanco.integrations.supabase,
    "a linha do Supabase É sobre o banco: ela TEM de mudar, senão a varredura não está medindo nada",
  );

  for (const nome of Object.keys(comBanco.integrations)) {
    if (nome === "supabase") continue;
    assert.deepEqual(
      semBanco.integrations[nome],
      comBanco.integrations[nome],
      `"${nome}" mudou de estado porque o BANCO caiu. Foi exatamente isto que o smtp fazia: ` +
        "status sobre e-mail derivado de uma consulta a organizations.",
    );
  }
});

test("smtp nunca é viva, e o motivo diz onde se configura e qual é o risco", () => {
  for (const bancoOk of [true, false]) {
    const { integrations } = montar({ evidencias: [{ assunto: ASSUNTOS.banco, ok: bancoOk, em: HOJE }] });
    const smtp = integrations.smtp;
    assert.equal(smtp.assunto, ASSUNTOS.email, "a linha do smtp tem de declarar que fala de e-mail");
    assert.equal(smtp.estado, "configurada_nao_verificada");
    assert.equal(smtp.verificado, false);
    assert.match(smtp.ondeSeConfigura ?? "", /Supabase/, "sem apontar o painel, ninguém resolve");
    assert.match(smtp.motivo, /recupera/i, "o motivo tem de nomear a consequência: recuperação de senha");
  }
});

test("supabase é viva quando o banco responde e quebrada quando não", () => {
  assert.equal(montar({ evidencias: [{ assunto: ASSUNTOS.banco, ok: true, em: HOJE }] }).integrations.supabase.estado, "viva");
  assert.equal(montar({ evidencias: [{ assunto: ASSUNTOS.banco, ok: false, em: HOJE }] }).integrations.supabase.estado, "quebrada");
  assert.equal(
    montar({ env: { SUPABASE_SERVICE_ROLE_KEY: "" }, evidencias: [{ assunto: ASSUNTOS.banco, ok: true, em: HOJE }] }).integrations.supabase.estado,
    "ausente",
    "sem credencial o estado é ausente, não quebrada: são causas diferentes e ações diferentes",
  );
});

test("o ambiente real de hoje sai retratado sem verde falso", () => {
  // Perplexity respondeu de verdade (21 linhas em ai_usage_events); OpenAI e
  // Anthropic têm chave e nenhuma resposta. É o retrato medido em 2026-07-29.
  const { integrations, resumo } = montar({
    evidencias: [
      { assunto: ASSUNTOS.banco, ok: true, em: HOJE },
      { assunto: ASSUNTOS.perplexity, ok: true, em: HOJE, detalhe: "sonar respondeu com 14 tokens" },
    ],
  });
  assert.equal(integrations.perplexity.estado, "viva");
  assert.equal(integrations.openai.estado, "configurada_nao_verificada");
  assert.equal(integrations.anthropic.estado, "configurada_nao_verificada");
  assert.ok(resumo.viva.includes("perplexity") && resumo.viva.includes("supabase"));
  assert.ok(!resumo.viva.includes("openai"), "chave presente não entra na lista de vivas");
  assert.ok(!resumo.viva.includes("smtp"), "e-mail não verificado não entra na lista de vivas");
});

test("todo estado publicado é conhecido, tem motivo, e aparece uma vez no resumo", () => {
  const { integrations, resumo } = montar();
  const nomes = Object.keys(integrations);
  assert.ok(nomes.length >= 8, `esperava ao menos 8 integrações, achei ${nomes.length} — varredura vazia passa por vacuidade`);
  for (const [nome, d] of Object.entries(integrations)) {
    assert.ok(ESTADOS_DE_CREDENCIAL.includes(d.estado), `${nome} publicou estado desconhecido: ${d.estado}`);
    assert.ok(d.motivo && d.motivo.trim().length > 10, `${nome} sem motivo legível — estado sem motivo é enfeite`);
    assert.ok(d.assunto, `${nome} não declara o assunto`);
  }
  const contados = Object.values(resumo).flat().sort();
  assert.deepEqual(contados, nomes.slice().sort(), "o resumo tem de cobrir exatamente as integrações publicadas");
  assert.deepEqual(resumirDeclaracoes(integrations), resumo);
});

test("CAPI desligada por variável é desativada; ligada e sem token é ausente", () => {
  assert.equal(montar({ env: { ATLAS_META_CAPI_ENABLED: "false" } }).integrations.metaCapi.estado, "desativada");
  assert.equal(
    montar({ env: { META_CONVERSIONS_ACCESS_TOKEN: "" } }).integrations.metaCapi.estado,
    "ausente",
  );
  // A decisão que esta rota já tinha tomado certo: o dataset vive no banco, por
  // organização, e NÃO pode ser conferido pelo ambiente.
  assert.ok(
    !montar().integrations.metaCapi.motivo.includes("META_CAPI_DATASET_ID"),
    "voltar a conferir o dataset no ambiente deixaria a tela verde com o envio bloqueado",
  );
});

// ─────────────────────────────────── a IA generativa: quem responde de verdade

test("o fallback determinístico NUNCA conta como IA viva", () => {
  /**
   * Em 2026-07-29 o banco tinha 43 linhas em ai_usage_events: 21 de
   * perplexity/sonar e 22 de local/deterministic-safe-fallback. As linhas
   * `local` são a PEGADA DE QUE TODOS OS PROVEDORES FALHARAM. Contar "existe
   * linha recente" como IA viva concluiria "pronta" exatamente nas chamadas em
   * que nenhuma IA respondeu.
   */
  const soFallback = evidenciasDeLinhasDeUso([
    { provider: PROVEDOR_DE_FALLBACK, model: MODELO_DE_FALLBACK, created_at: HOJE, total_tokens: 0 },
    // Recusa pelo NOME DO PROVEDOR, com outro modelo: isola a primeira guarda.
    { provider: PROVEDOR_DE_FALLBACK, model: "qualquer-outro", created_at: HOJE, total_tokens: 5 },
    // Recusa pelo NOME DO MODELO, com outro provedor: isola a segunda guarda.
    { provider: "openai", model: MODELO_DE_FALLBACK, created_at: HOJE, total_tokens: 0 },
  ]);
  assert.deepEqual(soFallback, [], "nenhuma dessas três linhas é prova de IA generativa viva");

  const comReal = evidenciasDeLinhasDeUso([
    { provider: "perplexity", model: "sonar", created_at: HOJE, total_tokens: 14 },
    { provider: PROVEDOR_DE_FALLBACK, model: MODELO_DE_FALLBACK, created_at: HOJE, total_tokens: 0 },
  ]);
  assert.equal(comReal.length, 1, "e o outro lado: a linha real TEM de contar");
  assert.equal(comReal[0].provedor, "perplexity");
  assert.equal(comReal[0].ok, true);
});

test("só a linha mais recente de cada provedor entra", () => {
  const antigo = new Date(AGORA - 3 * 86_400_000).toISOString();
  const evidencias = evidenciasDeLinhasDeUso([
    { provider: "perplexity", model: "sonar", created_at: antigo, total_tokens: 9 },
    { provider: "perplexity", model: "sonar", created_at: HOJE, total_tokens: 14 },
  ]);
  assert.equal(evidencias.length, 1);
  assert.equal(evidencias[0].em, HOJE, "prontidão é sobre agora");
});

test("generativa pronta é quem RESPONDEU, não quem tem chave", () => {
  // O retrato medido: a ordem configurada põe perplexity primeiro, e ela é a
  // única viva. O campo antigo olhava openai — o único que não responde.
  const p = avaliarProntidaoGenerativa({
    ordem: ["perplexity", "openai", "anthropic", "local"],
    configurados: { openai: true, anthropic: true, perplexity: true, localFallback: true },
    evidencias: [{ provedor: "perplexity", ok: true, em: HOJE, detalhe: "sonar, 14 tokens" }],
    agora: AGORA,
  });
  assert.equal(p.pronta, true);
  assert.equal(p.provedor, "perplexity");
  assert.equal(p.estado, "viva");
  assert.ok(!p.ordemConsiderada.includes("local"), "o fallback não pode entrar na ordem de IA generativa");
});

test("chave sem resposta nenhuma NÃO é IA pronta", () => {
  const p = avaliarProntidaoGenerativa({
    ordem: ["perplexity", "openai", "anthropic"],
    configurados: { openai: true, anthropic: true, perplexity: true },
    evidencias: [],
    agora: AGORA,
  });
  assert.equal(p.pronta, false);
  assert.equal(p.estado, "configurada_nao_verificada");
  assert.match(p.motivo, /Chave presente não é IA pronta/);
});

test("sem provedor nenhum a tela tem de dizer isso", () => {
  const p = avaliarProntidaoGenerativa({ ordem: ["openai"], configurados: {}, evidencias: [], agora: AGORA });
  assert.equal(p.pronta, false);
  assert.equal(p.estado, "ausente");
});

test("todos os configurados falhando é QUEBRADA, não 'pronta'", () => {
  const p = avaliarProntidaoGenerativa({
    ordem: ["openai", "anthropic"],
    configurados: { openai: true, anthropic: true },
    evidencias: [
      { provedor: "openai", ok: false, em: HOJE, detalhe: "HTTP 429 insufficient_quota" },
      { provedor: "anthropic", ok: false, em: HOJE, detalhe: "HTTP 400 credit balance too low" },
    ],
    agora: AGORA,
  });
  assert.equal(p.pronta, false);
  assert.equal(p.estado, "quebrada");
  assert.match(p.motivo, /fallback determinístico/, "a tela precisa saber que a resposta não vem de IA");
});

// ───────────────────────────── forma do nome do modelo: recusar sem gastar rede

test("nome de modelo truncado é reprovado sem chamada", () => {
  // Medido: `OPENAI_MODEL=gpt-5.6-` devolve HTTP 400 model_not_found.
  assert.match(problemaNoNomeDoModelo("gpt-5.6-"), /truncado/);
  assert.ok(problemaNoNomeDoModelo(""));
  assert.ok(problemaNoNomeDoModelo("  "));
  assert.ok(problemaNoNomeDoModelo("gpt 5.6 luna"), "espaço no meio");
  assert.ok(problemaNoNomeDoModelo(" gpt-5.6-luna"), "espaço na borda");
  assert.ok(problemaNoNomeDoModelo("-gpt-5.6"), "começa em separador");
  assert.ok(problemaNoNomeDoModelo("gpt--5.6"), "separador dobrado");
  assert.ok(problemaNoNomeDoModelo("gpt-5.6-luna?"), "caractere fora do alfabeto");
});

test("e o outro lado: todo nome real em uso é aprovado", () => {
  /**
   * A metade que importa mais. Um validador severo derrubaria a IA inteira em
   * nome de higiene — e passaria no teste acima.
   */
  for (const nome of [
    "gpt-5.6-luna", "gpt-5.6-terra", "gpt-5-mini", "gpt-4o-mini", "o3",
    "claude-sonnet-4-5", "claude-opus-4-8", "sonar", "sonar-pro",
    "deepseek-chat", "qwen-plus", "moonshot-v1-8k", "glm-4",
    "ft:gpt-4o:acme::abc123", "openai/gpt-5.6-luna",
  ]) {
    assert.equal(problemaNoNomeDoModelo(nome), null, `"${nome}" é nome real e foi reprovado`);
  }
});

test("URL base com esquema errado é reprovada, e a certa passa", () => {
  // `ANTHROPIC_BASE_URL=htts://api.anthropic.com` existia no ambiente real.
  assert.match(problemaNaUrlBase("htts://api.anthropic.com", "ANTHROPIC_BASE_URL"), /esquema/);
  assert.equal(problemaNaUrlBase("https://api.anthropic.com", "ANTHROPIC_BASE_URL"), null);
  assert.equal(problemaNaUrlBase("", "ANTHROPIC_BASE_URL"), null, "vazia não é inválida: é ausente");
});

test("o defeito de forma vem da variável que o PRODUTO lê, não de outra", () => {
  const semDefeito = defeitosDeFormaDoAmbiente(AMBIENTE);
  assert.deepEqual(semDefeito, { openai: null, anthropic: null, perplexity: null });

  // `OPENAI_MODEL` é letra morta: nenhum caminho do produto a lê. Fazer o estado
  // da OpenAI depender dela seria a MESMA doença — publicar como estado de um
  // assunto a checagem de outro.
  assert.equal(defeitosDeFormaDoAmbiente({ ...AMBIENTE, OPENAI_MODEL: "gpt-5.6-" }).openai, null);
  assert.match(defeitosDeFormaDoAmbiente({ ...AMBIENTE, ATLAS_AI_MODEL: "gpt-5.6-" }).openai, /ATLAS_AI_MODEL/);
  assert.match(
    defeitosDeFormaDoAmbiente({ ...AMBIENTE, ATLAS_ANTHROPIC_MODEL: "claude-sonnet-4-" }).anthropic,
    /ATLAS_ANTHROPIC_MODEL/,
  );
});

test("defeito de forma chega à prontidão como QUEBRADA", () => {
  const { integrations } = montar({ defeitos: { [ASSUNTOS.openai]: 'ATLAS_AI_MODEL="gpt-5.6-" termina em separador' } });
  assert.equal(integrations.openai.estado, "quebrada");
  assert.equal(integrations.anthropic.estado, "configurada_nao_verificada", "o defeito de um não contamina o outro");
});

// ────────────────── o painel precisa CONSEGUIR ler a prontidão que publicamos

/** O envelope exato de `apiSuccess`: `{ ok, data, meta }`. */
const envelope = (dados) => ({
  ok: true,
  data: dados,
  meta: { requestId: "r", correlationId: "r", version: "v1", timestamp: HOJE },
});

test("o painel lê o envelope de apiSuccess, e não o nível de cima", () => {
  /**
   * O defeito medido: `AtlasSystemPulse` lia `body.status`, `body.checks`,
   * `body.latencyMs`, `body.version` e `body.timestamp` — todos no nível de
   * cima, onde só existem `ok`, `data` e `meta`. `status` era sempre undefined,
   * então o painel dizia "Operação degradada" e "Nenhuma verificação
   * disponível" com a rota respondendo 200 e o banco em 219 ms.
   */
  const { integrations } = montar();
  const lida = lerRespostaDeProntidao(
    envelope({ status: "ready", latencyMs: 219, checks: { database: { ok: true, latencyMs: 219 } }, integrations }),
  );
  assert.equal(lida.status, "ready");
  assert.equal(prontidaoEstaVerde(lida), true);
  assert.equal(lida.latencyMs, 219);
  assert.equal(lida.versao, "v1");
  assert.equal(lida.em, HOJE);
  assert.deepEqual(lida.checks, [{ nome: "database", ok: true, latencyMs: 219 }]);
  assert.ok(lida.integracoes.length >= 8, "o painel tem de receber as integrações, não uma lista vazia");
  const smtp = lida.integracoes.find((linha) => linha.nome === "smtp");
  assert.equal(smtp.estado, "configurada_nao_verificada");
  assert.equal(smtp.verificado, false);
  assert.match(smtp.ondeSeConfigura, /Supabase/);
});

test("status irreconhecível NUNCA pinta verde", () => {
  for (const corpo of [
    null,
    {},
    { ok: true },
    envelope({}),
    envelope({ status: "quase" }),
    // O formato ANTIGO (payload achatado) não vira verde por tolerância: leitor
    // que na dúvida aprova é o defeito de novo, com outra roupa.
    { status: "ready", checks: { database: { ok: true } } },
  ]) {
    const lida = lerRespostaDeProntidao(corpo);
    assert.equal(prontidaoEstaVerde(lida), false, `${JSON.stringify(corpo)} não pode virar verde`);
    assert.ok(lida.motivo, "e o motivo tem de dizer por que não deu para ler");
  }
});

test("not_ready é lido como not_ready, e a recusa da rota chega com a mensagem", () => {
  assert.equal(lerRespostaDeProntidao(envelope({ status: "not_ready" })).status, "not_ready");
  const recusa = lerRespostaDeProntidao({ ok: false, error: { code: "X", message: "banco fora" }, meta: {} });
  assert.equal(recusa.status, "desconhecido");
  assert.match(recusa.motivo, /banco fora/, "erro sem mensagem na tela é erro que ninguém resolve");
});

test("estado em texto solto (o formato antigo) não vira verde nem some", () => {
  // Se um deploy antigo responder `integrations: { openai: "configured" }`, o
  // painel tem de mostrar a palavra e NÃO tratá-la como verificada.
  const lida = lerRespostaDeProntidao(envelope({ status: "ready", integrations: { openai: "configured" } }));
  assert.equal(lida.integracoes[0].estado, "configured");
  assert.equal(lida.integracoes[0].verificado, false);
});

// ─────────────────────────────────────── LIGAÇÃO: as rotas usam estes módulos

test("LIGAÇÃO: /api/v1/ready deriva do módulo e nenhuma linha nasce do banco", () => {
  const rota = fs.readFileSync(path.join(raiz, "app", "api", "v1", "ready", "route.ts"), "utf8");
  assert.match(rota, /montarProntidaoDasIntegracoes\(/, "a rota tem de usar a derivação executável");
  /**
   * Ancorado no INÍCIO DA LINHA de propósito: a guarda que proíbe nomear o
   * problema reprova pelo comentário que o explica — já aconteceu três vezes
   * neste repositório. Comentário começa em `*`, código começa em `nome:`.
   */
  const linhasSuspeitas = rota
    .split("\n")
    .filter((linha) => /^\s*(smtp|meta|metaCapi|whatsapp|openai|anthropic|perplexity)\s*:\s*checks\./.test(linha));
  assert.deepEqual(
    linhasSuspeitas,
    [],
    "alguma integração voltou a ser derivada de `checks.` — foi o defeito do smtp: " +
      "estado sobre e-mail saindo da consulta a organizations",
  );
});

test("LIGAÇÃO: o briefing publica generativeReady da avaliação, não da chave", () => {
  const rota = fs.readFileSync(path.join(raiz, "app", "api", "ai", "briefing", "route.ts"), "utf8");
  const linhas = rota.split("\n").filter((linha) => /^\s*generativeReady\s*:/.test(linha));
  assert.equal(linhas.length, 1, "generativeReady tem de ser publicado em UM lugar só");
  assert.match(
    linhas[0],
    /generativeReady:\s*generativa\.pronta/,
    "generativeReady voltou a sair de outra fonte. Era `aiProviderReadiness().openai`, " +
      "ou seja `Boolean(process.env.OPENAI_API_KEY)` — a chave do único provedor generativo que não responde.",
  );
});

test("LIGAÇÃO: o painel usa o leitor e não volta a ler o nível de cima", () => {
  const painel = fs.readFileSync(path.join(raiz, "components", "AtlasSystemPulse.tsx"), "utf8");
  assert.match(painel, /lerRespostaDeProntidao\(/, "o painel tem de usar o leitor executável");
  // Ancorado no que o defeito FAZIA: ler o campo direto do corpo da resposta.
  // Comentário começa em `*`; código, não.
  const suspeitas = painel
    .split("\n")
    .filter((linha) => /^\s*(const|return|setError|setPayload).*\b(body|payload)\.(status|checks|environment|timestamp)\b/.test(linha));
  assert.deepEqual(suspeitas, [], "o painel voltou a ler o campo fora do envelope `data` — era o defeito");
  assert.ok(!painel.includes("payload?.environment"), "`environment` nunca existiu no payload: mostrava '—' fingindo dado");
});

test("LIGAÇÃO: a OpenAI não é chamada sem modelo resolvido", () => {
  /**
   * Ancorado na REGIÃO da função, não numa linha: asserção presa a formatação
   * quebra no primeiro reflow. A Anthropic já recusava; a OpenAI seguia com
   * `model: ""` e queimava chamada mais retry para receber model_not_found.
   */
  const roteador = fs.readFileSync(path.join(raiz, "lib", "ai", "provider-router.ts"), "utf8");
  const inicio = roteador.indexOf("async function generateOpenAI");
  assert.ok(inicio > 0, "não achei generateOpenAI — a varredura perdeu a âncora");
  const regiao = roteador.slice(inicio, roteador.indexOf("const chamar =", inicio));
  assert.match(
    regiao,
    /if\s*\(!resolved\.model\)\s*throw/,
    "sem esta recusa, um nome de modelo inválido gasta chamada de API para descobrir o que o nome já dizia",
  );
});
