/**
 * Contrato de MOVER ETAPA EM LOTE.
 *
 * As 174 leads do Inside não estão em "novo" porque ninguém as trabalhou —
 * estão porque o CRM nunca soube. O histórico vive fora dele, e o corretor vem
 * trazer isso para dentro.
 *
 * Uma a uma seriam 174 telas abertas. O que se perde aí não é tempo: é a
 * vontade de manter o CRM em dia, que não volta depois que se perde.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");
const rota = ler("app", "api", "v1", "crm", "leads", "bulk-stage", "route.ts");
const tela = ler("app", "(crm)", "leads", "page.tsx");

/** Sem comentários: eles CITAM as etapas proibidas ao explicar a proibição. */
const rotaSemComentarios = rota.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("fechar lead NÃO pode ser feito em massa", () => {
  // `ganho` e `perdido` disparam evento de conversão para a Meta. Marcar 50
  // vendas por engano ensina o algoritmo a caçar o público errado, e não há
  // desfazer: o aprendizado já aconteceu.
  assert.match(rota, /const ETAPAS_EM_LOTE = new Set\(\["novo", "contato", "qualificacao", "visita", "proposta", "contrato"\]\)/);
  assert.ok(!/ETAPAS_EM_LOTE[^)]*"ganho"/.test(rotaSemComentarios));
  assert.ok(!/ETAPAS_EM_LOTE[^)]*"perdido"/.test(rotaSemComentarios));
  assert.match(rota, /STAGE_NOT_BULKABLE/);
  assert.match(rota, /não tem desfazer/);
});

test("a tela também não oferece fechar em massa", () => {
  const seletor = tela.slice(tela.indexOf('Mover para etapa'), tela.indexOf("Mover {selected.size}"));
  for (const proibida of ["ganho", "perdido"]) {
    assert.ok(!new RegExp(`value="${proibida}"`).test(seletor),
      `"${proibida}" não pode aparecer no seletor de lote`);
  }
});

test("a organização entra no WHERE, não só na leitura", () => {
  // Sem isso, um id de outra organização passaria batido no meio de 200.
  assert.match(rota, /\.in\("id", leadIds\)\s*\n\s*\.eq\("organization_id", organizationId\)/);
});

test("o que NÃO moveu é declarado", () => {
  // Silenciar a diferença faria o operador achar que foram todas e descobrir
  // na semana seguinte.
  assert.match(rota, /const naoMovidas = leadIds\.filter/);
  assert.match(rota, /aviso: naoMovidas\.length/);
  assert.match(tela, /payload\.data\?\.aviso/);
});

test("existe teto por chamada", () => {
  assert.match(rota, /const MAXIMO = 200;/);
  assert.match(rota, /TOO_MANY/);
  assert.match(rota, /divida a seleção e confira o que está movendo/);
});

test("o corretor move em lote — mas só a própria carteira", () => {
  // A versão anterior deste teste fixava o lote como ato exclusivo de
  // liderança, herdado do bulk-transfer. Confundia dois atos: TRANSFERIR muda
  // o dono (alçada de carteira), MOVER DE ETAPA é o trabalho diário de quem
  // atende — e quem tem 174 leads em "novo" é o corretor, não o gestor.
  //
  // O que ESTE contrato protege agora são as duas fronteiras que tornam a
  // liberação segura:
  assert.match(rota, /roles: \["admin", "director", "superintendent", "manager", "broker"\]/);
  // 1) o dono entra no WHERE do update (não em checagem prévia — corrida):
  //    lote de corretor só alcança lead da carteira dele;
  assert.match(rota, /soAsMinhas/);
  assert.match(rota, /assigned_user_id\.eq\.\$\{dono\},assigned_to\.eq\.\$\{dono\}/,
    "o filtro de dono cobre as DUAS colunas de posse — filtrar uma só vaza a outra");
  // 2) papel COMERCIAL decide, com o role de acesso como reserva — a mesma
  //    precedência do resto do CRM (commercialRole ?? role).
  assert.match(rota, /access\.profile\.commercialRole \|\| access\.access\.profile\.role/);
});

test("a etapa passa pelo vocabulário canônico", () => {
  // Aceitar string crua deixaria "Visita", "visita " e "VISITA" virarem três
  // etapas diferentes no banco.
  assert.match(rota, /canonicalPipelineStage\(body\.stage\)/);
  assert.match(rota, /STAGE_INVALID/);
});

test("a ação em lote faz UMA coisa — e a faz DENTRO da transação", () => {
  // Uma ação em lote que mexe em dono, tarefa e consentimento junto é uma ação
  // que ninguém consegue prever.
  //
  // ── POR QUE ESTA ASSERÇÃO MUDOU DE ALVO (2026-08-02) ──────────────────────
  //
  // Ela exigia, literalmente, `.update({ status: stage, updated_at: agora })` e
  // EXATAMENTE um `.update(` na rota. Fechada assim, ela não protegia o
  // invariante — ela congelava o defeito: obrigava o lote a mudar a etapa por
  // um update solto, fora de qualquer transação, e foi esse update que produziu
  // leads movidas sem nenhuma linha em `pipeline_stage_moves`.
  //
  // Medido na produção em 2026-08-02: 456 leads fora de "novo", 12 sem NENHUMA
  // linha no razão do funil (2,63%) — a fonte canônica de velocidade,
  // envelhecimento, tempo por etapa e taxa de passagem.
  //
  // O invariante real nunca foi "existe um update". Era, e continua sendo: o
  // lote muda ETAPA e nada mais — não mexe em dono, tarefa nem consentimento.
  // Ele agora é conferido no payload da transação, que é onde a escrita passou
  // a acontecer. Zero updates soltos é mais forte que um update conferido: não
  // existe mais lugar na rota onde a etapa possa mudar sem rastro.
  assert.equal([...rotaSemComentarios.matchAll(/\.update\(/g)].length, 0,
    "o lote não pode ter update próprio de lead: mudar a etapa fora da transação é exatamente o que produziu as 12 leads sem rastro");
  assert.match(rotaSemComentarios, /admin\.rpc\("move_pipeline_lead", \{/,
    "a etapa muda pela MESMA função que a rota de movimento individual chama — não por uma segunda forma");

  const inicio = rotaSemComentarios.indexOf('admin.rpc("move_pipeline_lead"');
  const chamada = rotaSemComentarios.slice(inicio, rotaSemComentarios.indexOf("});", inicio));
  // Dono no FILTRO restringe; dono no PAYLOAD transfere. O payload da transação
  // não tem como carregar dono, tarefa ou consentimento.
  for (const proibido of ["assigned_to", "assigned_user_id", "metadata", "consent", "owner"]) {
    assert.ok(!new RegExp(proibido).test(chamada),
      `"${proibido}" no payload da movimentação seria uma segunda ação escondida no lote`);
  }
  assert.match(chamada, /p_to_stage: stage/, "o destino é a etapa pedida");
  assert.match(chamada, /p_expected_from_stage: lead\.status \?\? "novo"/,
    "a origem é lida da lead: o razão guarda a TRANSIÇÃO, não o efeito colateral 'agora está em X'");
  assert.ok(!/metadata/.test(rotaSemComentarios), "consentimento e formulário ficam intocados");
});

test("toda lead contada como movida tem linha no razão do funil", () => {
  // `pipeline_stage_moves` é a fonte canônica de tudo que mede funil. Escrita
  // muda — a que não devolve prova nenhuma — é o que produziu as 12 leads sem
  // rastro medidas em produção. Aqui a prova é conferida lead a lead.
  assert.match(rotaSemComentarios, /const moveId = typeof dados\.moveId === "string" \? dados\.moveId : null;/,
    "o id da linha do razão é lido do retorno de CADA escrita");
  assert.ok(
    rotaSemComentarios.indexOf("movidasIds.push") > rotaSemComentarios.indexOf("if (!moveId)"),
    "a lead só entra na conta de movidas DEPOIS da prova de que a linha do razão existe",
  );
  assert.match(rotaSemComentarios, /semRazao = "resposta_sem_rastro"/,
    "resposta sem o id do razão para o lote — seguir seria fabricar movimento invisível");

  // A falha ao gravar o razão não pode ser confundida com recusa de regra: são
  // a mesma resposta para o operador ("não moveu") e problemas opostos. A
  // separação vem de uma lista FECHADA dos nomes que a função levanta — não de
  // um prefixo. Medido: a mensagem da inserção que falha cita a própria tabela
  // `pipeline_stage_moves`, então classificar por prefixo `pipeline_` chamava a
  // falha do razão de regra de negócio e a escondia do operador.
  assert.match(rotaSemComentarios, /const recusasTecnicas = recusas\.filter\(\(r\) => !RECUSAS_DE_REGRA\.has\(r\.motivo\)\)\.length;/,
    "o que separa recusa de regra de falha técnica é a lista fechada, não o prefixo do nome");
  for (const nome of ["pipeline_move_out_of_scope", "pipeline_stage_conflict", "pipeline_lead_not_found"]) {
    assert.ok(new RegExp(`"${nome}"`).test(rota), `"${nome}" é levantado pela função e precisa estar na lista de recusas de regra`);
  }
  assert.match(rota, /recusasTecnicas \?/, "o aviso ao operador nomeia a falha de histórico quando ela acontece");
});

test("banco sem a transação não move nada pela metade", () => {
  // A rota de movimento individual mantém uma escrita compensatória para bancos
  // sem a função: muda a etapa, tenta auditar, desfaz se falhar. Repetir isso
  // 200 vezes por chamada é multiplicar o defeito que esta correção apaga.
  assert.match(rotaSemComentarios, /RPC_AUSENTE\.has\(codigo\)/,
    "função ausente no banco é reconhecida (42883 do Postgres, PGRST202 do PostgREST)");
  assert.match(rotaSemComentarios, /semRazao = "sem_transacao"/);
  assert.match(rota, /BULK_STAGE_NO_LEDGER/, "o lote recusa em vez de mover sem histórico");
  assert.ok(!/pipeline_history/.test(rota),
    "nenhuma escrita compensatória de reserva: falhar é melhor que mover sem rastro");
});

test("a tela dá o lote ao corretor sem lhe dar a transferência", () => {
  // A API liberada de nada valia: a barra de seleção inteira (caixas + seletor
  // de etapa) estava atrás de `canTransfer`, e o corretor não via nem as
  // caixas. As capacidades agora são distintas — e este contrato impede que
  // uma volte a engolir a outra.
  assert.match(tela, /const podeMoverEmLote = canTransfer \|\| currentRole === "broker"/,
    "selecionar e mover etapa é de todos; a rota prende o corretor à carteira dele");
  assert.match(tela, /\{podeMoverEmLote && selected\.size \? \(/,
    "a barra abre para quem pode mover, não só para quem pode transferir");
  // E a transferência NÃO acompanha: o bloco do alvo/motivo/confirmar
  // permanece atrás de canTransfer dentro da barra.
  const barra = tela.slice(tela.indexOf("podeMoverEmLote && selected.size"), tela.indexOf("Cancelar"));
  assert.match(barra, /\{canTransfer \? \(<>/,
    "o corretor recebe só a metade de mover etapa — transferir segue sendo alçada de carteira");
});
