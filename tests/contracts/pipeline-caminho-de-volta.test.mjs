/**
 * Contrato do CAMINHO DE VOLTA.
 *
 * Toda recusa do pipeline carrega o próximo passo concreto de quem está olhando
 * a tela. A régua não é estética: recusa sem saída faz o corretor repetir a
 * mesma tentativa até desistir da lead.
 *
 * O caso que motivou isto: oito exceções distintas da RPC caíam todas em
 * "Atualize o Kanban e confira a etapa atual". Para a lead que pertence a outra
 * pessoa, isso é um beco — ela não muda de dono porque ele atualizou a tela.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");
const fonte = ler("lib", "crm", "pipeline-guidance.ts");
const g = await import(`data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(fonte))}`);

const TODAS = { ...g.RECUSAS, ...g.RECUSAS_DA_ROTA, ...g.RECUSAS_DE_ACESSO };

test("toda recusa tem caminho, e ele não repete o problema", () => {
  for (const [chave, o] of Object.entries(TODAS)) {
    assert.ok(o.caminho && o.caminho.length > 25, `${chave}: caminho vazio ou curto demais`);
    assert.notEqual(o.caminho, o.problema, `${chave}: o caminho só repete o problema`);
    assert.ok(o.problema && o.problema.length > 10, `${chave}: problema vazio`);
  }
});

test("o caminho fala de AÇÃO, não de estado", () => {
  // Um caminho que não contém verbo de ação é descrição disfarçada.
  const verbos = /pe[çc]a|escolha|escreva|atualize|recarregue|entre|avise|espere|confirme|mova|tente|ligue|marque|combine|acompanhe/i;
  for (const [chave, o] of Object.entries(TODAS)) {
    assert.match(o.caminho, verbos, `${chave}: o caminho não diz o que fazer`);
  }
});

test("lead de outra carteira NÃO manda atualizar a tela", () => {
  // O beco original: atualizar não transfere lead nenhuma. Ele atualiza, tenta
  // de novo, lê a mesma frase, e conclui que o CRM está quebrado.
  const fora = g.RECUSAS.pipeline_move_out_of_scope;
  assert.ok(!/^atualize/i.test(fora.caminho));
  assert.match(fora.caminho, /gestor|diretor/i, "o caminho verdadeiro é pedir a transferência");
  assert.equal(fora.acao, "falar-com-gestor");
  // E a mesma lead barrada pela checagem de acesso diz a mesma coisa: as duas
  // portas para o mesmo problema não podem orientar diferente.
  assert.equal(g.RECUSAS_DE_ACESSO.ESCOPO.caminho, fora.caminho);
});

test("as oito exceções da RPC estão mapeadas", () => {
  // Se a RPC ganhar uma exceção nova e ninguém mapear, ela cai na genérica —
  // que é justamente o comportamento que este contrato existe para impedir.
  for (const chave of [
    "pipeline_move_out_of_scope", "pipeline_lead_not_found", "pipeline_stage_conflict",
    "pipeline_stage_invalid", "pipeline_buyer_reason_required", "pipeline_undo_invalid",
    "pipeline_already_reversed", "pipeline_undo_stale",
  ]) {
    assert.ok(g.RECUSAS[chave], `${chave} sem orientação`);
  }
});

test("orientar() devolve a orientação ESPECÍFICA de todo código da rota", () => {
  // Mutation test M01: desligando a busca em RECUSAS_DA_ROTA, toda recusa de
  // rota passava a cair na genérica — "atualize o Kanban" para tudo — e a suíte
  // ficava verde, porque os testes liam o objeto direto e nunca chamavam a
  // função. Aqui a função é EXERCITADA com cada código que a rota realmente usa.
  const generica = g.orientar("codigo-que-nao-existe-em-lugar-nenhum");
  for (const codigo of Object.keys(g.RECUSAS_DA_ROTA)) {
    const o = g.orientar(codigo);
    assert.equal(o.caminho, g.RECUSAS_DA_ROTA[codigo].caminho,
      `orientar("${codigo}") não devolveu a orientação daquele código`);
    assert.notEqual(o.caminho, generica.caminho,
      `orientar("${codigo}") caiu na genérica — a recusa perdeu o caminho específico`);
  }
});

test("orientar() devolve a orientação ESPECÍFICA de toda exceção da RPC", () => {
  const generica = g.orientar("codigo-que-nao-existe-em-lugar-nenhum");
  for (const chave of Object.keys(g.RECUSAS)) {
    // Como o Postgres entrega: texto livre com a chave no meio.
    const o = g.orientar(`erro do banco: ${chave} (P0001)`);
    assert.equal(o.caminho, g.RECUSAS[chave].caminho, `${chave} não foi reconhecida na mensagem crua`);
    assert.notEqual(o.caminho, generica.caminho, `${chave} caiu na genérica`);
  }
});

// ── A tela recebe a recusa de verdade ──────────────────────────────────────

test("extrairRecusa() entrega erro, caminho e ação do corpo da rota", () => {
  // Mutation test M05: a leitura vivia dentro da página e o contrato fazia
  // `grep` por "payload.caminho". Desligando o `if`, o texto continuava no
  // arquivo (dentro do bloco) e a suíte ficava verde com o caminho nunca
  // chegando ao corretor. Fora da página, a regra é exercitável.
  const r = g.extrairRecusa({ error: "Esta lead está com outra pessoa.", caminho: "Peça ao gestor.", acao: "falar-com-gestor" });
  assert.equal(r.erro, "Esta lead está com outra pessoa.");
  assert.equal(r.caminho, "Peça ao gestor.");
  assert.equal(r.acao, "falar-com-gestor");
});

test("extrairRecusa() não inventa caminho quando a rota não mandou", () => {
  // Caminho vazio tem que virar null, não string vazia: a tela decide mostrar
  // ou não pela presença, e "" apareceria como uma caixa azul sem texto.
  for (const corpo of [{}, null, undefined, "não é json", { error: "x" }, { error: "x", caminho: "" }]) {
    const r = g.extrairRecusa(corpo);
    assert.equal(r.caminho, null, `corpo ${JSON.stringify(corpo)} produziu caminho`);
    assert.ok(r.erro.length > 0, "nunca devolve erro vazio — a tela mostraria uma caixa muda");
  }
  // Sem `error` no corpo (um 502 do proxy, que devolve HTML), a frase padrão
  // assume — e ela precisa dizer que a lead não se moveu, não só que falhou.
  assert.match(g.extrairRecusa({}).erro, /permaneceu na etapa anterior/);
  // Com `error`, o que a rota disse prevalece: é ela que sabe o que houve.
  assert.equal(g.extrairRecusa({ error: "x" }).erro, "x");
});

test("orientar() acha pela mensagem crua do Postgres", () => {
  // `raise exception 'pipeline_undo_stale'` chega com prefixo do driver.
  assert.equal(
    g.orientar('erro: pipeline_undo_stale').caminho,
    g.RECUSAS.pipeline_undo_stale.caminho,
  );
  assert.equal(g.orientar("").caminho, g.orientar(null).caminho, "vazio cai na genérica");
  assert.ok(g.orientar("coisa que ninguém mapeou").caminho.length > 25, "a genérica também aponta saída");
});

test("orientarAcesso() cobre escopo, sessão e organização", () => {
  assert.equal(g.orientarAcesso("Lead fora do seu escopo comercial.")?.acao, "falar-com-gestor");
  assert.ok(g.orientarAcesso("sessão expirada"));
  assert.ok(g.orientarAcesso("usuário sem organização"));
  assert.equal(g.orientarAcesso("qualquer outra coisa"), null, "sem palpite: null é honesto");
});

// ── A rota entrega isso de fato ────────────────────────────────────────────

test("a rota não recusa sem passar pela orientação", () => {
  // ── ESTE TESTE JÁ FOI DECORATIVO ──────────────────────────────────────────
  //
  // A versão anterior filtrava LINHA A LINHA procurando
  // `NextResponse.json({ error:` na mesma linha. O arquivo é formatado em
  // várias linhas: das 7 chamadas, o filtro enxergava ZERO. Ele comparava lista
  // vazia com lista vazia — não existia nada capaz de fazê-lo falhar, e uma
  // recusa sem caminho (a 422 do piso de tentativas) já estava no código,
  // passando por baixo dele.
  //
  // Foi uma auditoria adversarial que achou; o mutation testing não pega este
  // caso, porque a mutação certa aqui seria "adicionar uma recusa nova", e não
  // "quebrar uma existente".
  //
  // Agora casa o objeto INTEIRO, atravessando quebras de linha.
  const rota = ler("app", "api", "v1", "pipeline", "route.ts");
  const semComentarios = rota.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

  const cruas = [...semComentarios.matchAll(/NextResponse\.json\(\s*\{[\s\S]{0,600}?\}\s*,\s*\{\s*status:/g)]
    .map((m) => m[0])
    // `authError` monta a resposta a partir de `orientarAcesso`; a de sucesso
    // não tem `error`; a de rate limit usa `orientar` acima da chamada.
    .filter((bloco) => /\berror:/.test(bloco))
    .filter((bloco) => !/o\.problema|o\.caminho|caminho:/.test(bloco));

  assert.deepEqual(cruas, [],
    `estas recusas não carregam caminho:\n${cruas.map((c) => c.slice(0, 160)).join("\n---\n")}`);
});

test("o filtro acima TEM DENTES — pega uma violação plantada", () => {
  // ── GUARDA DO GUARDA ──────────────────────────────────────────────────────
  //
  // O defeito anterior não era a régua estar errada: era ela não enxergar nada
  // e mesmo assim declarar sucesso. Um teste que afirma "não achei problema"
  // precisa provar primeiro que sabe achar.
  //
  // Contar recusas no arquivo real não serve: quanto MELHOR o código fica (tudo
  // passando por `recusar()`), menos formas cruas sobram — e a contagem cairia
  // sozinha até zero, reintroduzindo a cegueira por outro caminho.
  //
  // Então a régua é exercitada contra amostras sintéticas: uma que ela DEVE
  // pegar, e uma que ela NÃO pode acusar.
  const REGRA = /NextResponse\.json\(\s*\{[\s\S]{0,600}?\}\s*,\s*\{\s*status:/g;
  const achar = (amostra) => [...amostra.matchAll(REGRA)]
    .map((m) => m[0])
    .filter((b) => /\berror:/.test(b))
    .filter((b) => !/o\.problema|o\.caminho|caminho:/.test(b));

  const violacao = `
    return NextResponse.json(
      {
        error: "Alguma coisa deu errado.",
        code: "SEM_SAIDA",
      },
      { status: 422 },
    );`;
  assert.equal(achar(violacao).length, 1, "a régua não pegou uma recusa sem caminho plantada de propósito");

  const correta = `
    return NextResponse.json(
      {
        error: "Alguma coisa deu errado.",
        caminho: "Faça isto para resolver.",
      },
      { status: 422 },
    );`;
  assert.equal(achar(correta).length, 0, "a régua acusou uma recusa que TEM caminho");
});

test("lead fora do escopo é 403, não 409", () => {
  // 409 faz cliente e tela tratarem como disputa de versão — "tente de novo" —
  // e o corretor entra num laço que nunca termina.
  const rota = ler("app", "api", "v1", "pipeline", "route.ts");
  assert.match(rota, /foraDoEscopo \? 403/);
});

test("a tela mostra o caminho, não só o erro", () => {
  const pagina = ler("app", "(crm)", "pipeline", "page.tsx");
  // A leitura em si é provada pelos testes de `extrairRecusa` acima. Aqui só
  // resta o que é JSX e não dá para exercitar: que a página CHAME a função e
  // ALIMENTE o aviso com o resultado. As duas linhas juntas, não cada uma solta
  // — foi separá-las que deixou o mutation test M05 passar.
  assert.match(pagina, /const recusa = extrairRecusa\(payload\);\s*\n\s*if \(recusa\.caminho\) setCaminho\(/,
    "a página precisa chamar extrairRecusa e alimentar o aviso com o resultado");
  assert.match(pagina, /O que fazer/);
  assert.match(pagina, /caminho\.acao === "falar-com-gestor"/);
});

// ── Pontos de conhecimento ────────────────────────────────────────────────

test("toda etapa do funil tem ponto de conhecimento", () => {
  // Sem isto cada corretor decide sozinho o que "Qualificação" quer dizer, e o
  // funil deixa de medir a mesma coisa entre pessoas.
  for (const etapa of ["novo", "contato", "qualificacao", "visita", "proposta",
    "contrato", "ganho", "perdido", "comprou_outro"]) {
    const p = g.conhecimentoDaEtapa(etapa);
    assert.ok(p, `${etapa} sem ponto de conhecimento`);
    assert.ok(p.significa.length > 15, `${etapa}: "significa" vazio`);
    assert.ok(p.paraAvancar.length > 25, `${etapa}: "para avançar" vazio`);
  }
  assert.equal(g.conhecimentoDaEtapa("inventada"), null);
});

test("o Kanban mostra o ponto de conhecimento na coluna", () => {
  const pagina = ler("app", "(crm)", "pipeline", "page.tsx");
  assert.match(pagina, /conhecimentoDaEtapa\(stage\.key\)/);
  assert.match(pagina, /Para avançar:/);
  // Só na visão confortável: 9 colunas compactas com texto viram parede.
  assert.match(pagina, /!compact && conhecimentoDaEtapa/);
});
