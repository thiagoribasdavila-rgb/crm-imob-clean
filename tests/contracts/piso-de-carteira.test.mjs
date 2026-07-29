/**
 * Contrato do PISO DE CARTEIRA na listagem de leads.
 *
 * ── O DEFEITO QUE ISTO FIXA ──────────────────────────────────────────────────
 *
 * Medido em 2026-07-28 com um corretor descartável de ZERO leads: a rota
 * `GET /api/v1/crm/leads` devolvia as 200 leads da imobiliária. O filtro de
 * dono só existia quando o CLIENTE pedia (`assigned_to`/`team_owner`) — quem
 * não pedisse via a carteira inteira dos colegas.
 *
 * O Kanban (`GET /api/v1/pipeline`) já tinha o piso desde a correção anterior.
 * Duas telas do MESMO dado com regras opostas é a divergência que atravessou
 * esta sessão inteira; aqui ela não confundia, vazava.
 *
 * Prova comportamental viva: scripts/prova-fronteira-do-corretor.mjs — corretor
 * sem leads recebe 0, com 2 leads recebe exatamente 2, liderança recebe 200.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  aplicarPisoDeCarteira,
  estaNaMinhaCarteira,
  filtroDaMinhaCarteira,
} from "../../lib/crm/escopo-de-leitura.ts";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");

const rotaLeads = ler("app", "api", "v1", "crm", "leads", "route.ts");
const rotaPipeline = ler("app", "api", "v1", "pipeline", "route.ts");
const apiAuth = ler("lib", "security", "api-auth.ts");
const rotaLead360 = ler("app", "api", "v1", "leads", "[id]", "route.ts");
const rotaVisitas = ler("app", "api", "v1", "leads", "[id]", "visits", "route.ts");
const rotaQualificacao = ler("app", "api", "v1", "leads", "[id]", "qualify", "route.ts");
const rotaPrimeiroContato = ler("app", "api", "v1", "leads", "[id]", "first-contact", "route.ts");

test("a listagem aplica piso de carteira sem o cliente pedir", () => {
  assert.match(rotaLeads, /const soAMinhaCarteira =/,
    "o piso precisa existir independentemente dos filtros da URL");
  assert.match(rotaLeads, /else if \(soAMinhaCarteira\) \{/,
    "o piso entra na cadeia de filtros de dono, como último recurso");
  assert.match(rotaLeads, /filtroDaMinhaCarteira\(access\.access\.user\.id\)/,
    "o filtro de posse vem do módulo compartilhado");
});

test("lead sem dono continua visível para todos", () => {
  // Escondê-la de quem não é liderança a deixaria parada até alguém abrir um
  // relatório: ela precisa ser vista para ser adotada.
  const modulo = ler("lib", "crm", "escopo-de-leitura.ts");
  assert.match(modulo, /and\(assigned_user_id\.is\.null,assigned_to\.is\.null\)/);
  assert.match(modulo, /assigned_user_id\.eq\.\$\{userId\},assigned_to\.eq\.\$\{userId\}/,
    "as DUAS colunas de posse — a base tem histórico nos dois lados");
});

test("liderança NÃO perde a visão do todo", () => {
  // Um piso bom demais quebra a gestão em silêncio — e silêncio aqui significa
  // um gestor achando que a operação encolheu.
  const modulo = ler("lib", "crm", "escopo-de-leitura.ts");
  assert.match(modulo, /"director", "superintendent", "manager", "admin"/);
  assert.match(modulo, /input\.role === "admin"/,
    "admin sem papel comercial definido continua sendo liderança");
});

test("existe UMA definição de quem vê o funil inteiro", () => {
  // A primeira versão deste teste comparava o TEXTO do conjunto nas duas
  // rotas — e reprovou por ordem diferente dos mesmos papéis. O susto foi
  // útil: enquanto forem duas cópias, elas PODEM divergir de verdade, e um
  // contrato só detecta depois do estrago. A regra virou módulo único.
  const modulo = ler("lib", "crm", "escopo-de-leitura.ts");
  assert.match(modulo, /VE_O_FUNIL_INTEIRO = new Set\(\["director", "superintendent", "manager", "admin"\]\)/);
  assert.match(modulo, /export function leLiderancaInteira/);
  assert.match(modulo, /export function filtroDaMinhaCarteira/);

  // E as duas rotas CONSOMEM o módulo, em vez de reimplementar.
  for (const [nome, codigo] of [["listagem", rotaLeads], ["Kanban", rotaPipeline]]) {
    assert.match(codigo, /from "@\/lib\/crm\/escopo-de-leitura"/, `${nome} precisa importar a regra`);
    assert.ok(!/new Set\(\["director"/.test(codigo),
      `${nome} voltou a ter cópia própria do conjunto de papéis`);
  }
  assert.match(rotaLeads, /leSoAPropriaCarteira\(access\.access\.profile\)/);
  assert.match(rotaPipeline, /leLiderancaInteira\(identity\)/);
});

test("a resposta declara o recorte que aplicou", () => {
  // Sem isto a tela diz "todos os leads" mostrando parte deles — e ausência
  // não declarada é indistinguível de zero, o defeito que mais se repetiu aqui.
  assert.match(rotaLeads, /escopo: soAMinhaCarteira \? "carteira" : "organizacao"/);
});

test("o piso não pode ser pulado por parâmetro", () => {
  /**
   * `donoUnico` entrava na cadeia de filtros ANTES de `soAMinhaCarteira` e
   * curto-circuitava o piso. A única validação era o uuid ser um perfil ativo
   * da mesma organização — nenhuma checagem de hierarquia.
   *
   * PROVADO NO NAVEGADOR em 2026-07-29, com a sessão de um corretor real:
   * GET /api/v1/crm/leads?assigned_to=<colega> devolvia 270 leads do colega,
   * COM NOME. Mesma classe do vazamento que matou a tela /customers — e esta é
   * a rota para onde a central manda todo mundo clicar.
   *
   * Depois: 403 OWNER_OUT_OF_SCOPE. A própria carteira segue respondendo 195
   * com e sem o parâmetro.
   */
  assert.match(rotaLeads, /if \(soAMinhaCarteira && assignedTo !== access\.access\.user\.id/,
    "quem só enxerga a própria carteira só pode PEDIR a própria carteira");
  assert.match(rotaLeads, /"OWNER_OUT_OF_SCOPE"[\s\S]{0,120}status: 403/,
    "recusa explícita: devolver a carteira dele em silêncio esconderia a tentativa");
  // As duas formas de identidade, porque o repositório já divergiu nisso antes.
  assert.match(rotaLeads, /assignedTo !== access\.access\.profile\.id/,
    "user.id e profile.id: pedir a própria carteira por qualquer uma das duas tem de passar");
});

test("o escopo de equipe também não é pulável por parâmetro", () => {
  /**
   * Mesma classe do `assigned_to`, achada aplicando a lição dele: o código
   * aceitava `team_owner` de qualquer papel e só conferia se o ALVO era
   * gerente — nunca se o SOLICITANTE estava acima dele.
   *
   * Medido em 2026-07-29: hoje devolvia 0, e só por SORTE DO DADO —
   * `profiles.team` é nulo em todos, então `profileTeamScope` degenera para
   * "só o próprio gerente". No dia em que as equipes forem preenchidas, um
   * corretor lê a equipe inteira de um gerente qualquer.
   *
   * Trava que depende de coluna vazia não é trava.
   */
  assert.match(rotaLeads, /if \(teamOwner\) \{[\s\S]{0,900}?if \(soAMinhaCarteira\) \{[\s\S]{0,200}?"TEAM_OUT_OF_SCOPE"/,
    "quem só enxerga a própria carteira não tem equipe para consultar");
});

test("o piso vale na ESCRITA, não só na leitura", () => {
  /**
   * MEDIDO EM 2026-07-29, executando com a sessão de um corretor descartável de
   * carteira VAZIA contra a lead de um colega — cada linha relida do banco
   * depois do verbo, não só o HTTP:
   *
   *   PATCH /api/v1/leads/{id} ............... 200 · nome, telefone, notas e
   *                                            orçamento sobrescritos
   *   PATCH /api/v1/leads/{id} {status} ...... 200 · novo → contato → perdido
   *   POST  /api/v1/leads/{id}/qualify ....... 200 · score_ia e temperatura
   *   POST  /api/v1/leads/{id}/first-contact . 201 · SLA do colega FECHADO
   *   POST  /api/v1/leads/{id}/visits ........ 201 · visita com broker_id do
   *                                            colega, na agenda dele
   *
   * O Kanban recusava a MESMA movimentação com 403, porque lá a RPC reconfere
   * o ator dentro do banco. Porta da frente trancada, porta lateral aberta: a
   * classe "caminhos divergentes" outra vez.
   *
   * A raiz era `requireLeadAccess` conferir ORGANIZAÇÃO e não dono — o SELECT
   * saía com o cliente do usuário, mas em `leads` as políticas permissivas se
   * somam por OR e a de organização inteira engole as comerciais.
   */
  assert.match(apiAuth, /from "@\/lib\/crm\/escopo-de-leitura"/,
    "o recorte da escrita é o MESMO da leitura, importado — nunca reescrito aqui");
  assert.match(apiAuth, /aplicarPisoDeCarteira\(\s*consulta,/,
    "requireLeadAccess precisa aplicar o piso na consulta, não só filtrar por organização");
  assert.match(apiAuth, /class LeadForaDaCarteiraError extends Error/,
    "a recusa precisa de tipo próprio: pela mensagem, nenhuma rota consegue devolver 403");
  assert.match(apiAuth, /if \(error \|\| !data\) throw new LeadForaDaCarteiraError\(\);/,
    "e é ELA que tem de ser levantada — um Error genérico volta a virar 401/500 nas rotas");
});

test("cada rota que escreve na lead recusa com 403 e código próprio", () => {
  // 401 manda a tela deslogar o corretor; 400 manda ele "corrigir os dados";
  // 500 diz que o servidor quebrou. Nenhum dos três é verdade — é permissão.
  const esperado = [
    ["Lead 360", rotaLead360, "LEAD_OUT_OF_SCOPE"],
    ["visitas", rotaVisitas, "VISIT_OUT_OF_SCOPE"],
    ["qualificação", rotaQualificacao, "QUALIFY_OUT_OF_SCOPE"],
  ];
  for (const [nome, codigo, code] of esperado) {
    assert.match(codigo, /ehLeadForaDaCarteira\(error\)/, `${nome} precisa reconhecer a recusa de carteira`);
    assert.match(codigo, new RegExp(`code: "${code}"[\\s\\S]{0,80}status: 403`), `${nome} precisa recusar com 403 e código próprio`);
  }
  // O registro de contato não passa por requireLeadAccess: ele lê a lead com o
  // cliente do usuário e decidia por conta própria. Parar o relógio de SLA de
  // outra pessoa é falsificar a métrica de quem nem sabe que foi medido.
  assert.match(rotaPrimeiroContato, /from "@\/lib\/crm\/escopo-de-leitura"/);
  assert.match(rotaPrimeiroContato, /estaNaMinhaCarteira\(access\.access\.profile\.id, lead\.data\)/);
  // A GUARDA, não só a conta: desligar o `if` deixaria as chamadas acima vivas
  // e o grep verde — foi exatamente assim que um mutation test achou o buraco
  // do `caminho` que a tela nunca lia.
  assert.match(rotaPrimeiroContato, /if \(leSoAPropriaCarteira\(access\.access\.profile\) && !daMinhaCarteira\) \{/,
    "o recorte precisa DECIDIR a recusa, não apenas ser calculado");
  assert.match(rotaPrimeiroContato, /"FIRST_CONTACT_OUT_OF_SCOPE"[\s\S]{0,140}status: 403/);
});

test("o Kanban continua recusando com a MESMA saída de antes", () => {
  // A recusa passou a acontecer antes da RPC. Se ela chegar à tela com outro
  // código, o corretor perde o "peça a transferência ao gestor" que já existia
  // — e recusa sem saída é armadilha.
  assert.match(rotaPipeline, /ehLeadForaDaCarteira\(error\)\) return recusar\("pipeline_move_out_of_scope", 403\)/,
    "a recusa antecipada precisa devolver o mesmo código que a RPC devolvia");
});

test("o piso é aplicado à consulta — e só para quem lê a própria carteira", () => {
  /**
   * Executável de propósito: um grep pelo nome da função ficaria verde com o
   * `or` desligado. Aqui a consulta é de mentira e conta as chamadas.
   */
  const consultaFalsa = () => {
    const chamadas = [];
    const alvo = { chamadas, or(filtro) { chamadas.push(filtro); return alvo; } };
    return alvo;
  };

  const corretor = consultaFalsa();
  aplicarPisoDeCarteira(corretor, { commercialRole: "broker", role: "broker" }, "u-1");
  assert.deepEqual(corretor.chamadas, [filtroDaMinhaCarteira("u-1")],
    "corretor: a consulta TEM de sair com o filtro de posse");

  for (const papel of ["manager", "director", "superintendent"]) {
    const lideranca = consultaFalsa();
    aplicarPisoDeCarteira(lideranca, { commercialRole: papel, role: "manager" }, "u-1");
    assert.deepEqual(lideranca.chamadas, [], `${papel}: liderança não pode perder a visão do todo`);
  }
});

test("o gêmeo em JavaScript concorda com o filtro em SQL, caso a caso", () => {
  // Duas formas da mesma regra é como nasceram os caminhos divergentes deste
  // repositório. Enquanto existirem as duas, elas respondem junto ou o
  // contrato quebra.
  const eu = "u-1";
  const outro = "u-2";
  assert.equal(estaNaMinhaCarteira(eu, { assigned_to: eu, assigned_user_id: null }), true);
  assert.equal(estaNaMinhaCarteira(eu, { assigned_to: null, assigned_user_id: eu }), true);
  assert.equal(estaNaMinhaCarteira(eu, { assigned_to: outro, assigned_user_id: outro }), false);
  assert.equal(estaNaMinhaCarteira(eu, { assigned_to: outro, assigned_user_id: null }), false);
  assert.equal(estaNaMinhaCarteira(eu, { assigned_to: null, assigned_user_id: outro }), false);
  // Lead sem dono continua alcançável: é assim que ela é adotada. Esconder o
  // órfão a deixaria parada para sempre — a mesma cláusula do filtro SQL.
  assert.equal(estaNaMinhaCarteira(eu, { assigned_to: null, assigned_user_id: null }), true);
  assert.match(filtroDaMinhaCarteira(eu), /and\(assigned_user_id\.is\.null,assigned_to\.is\.null\)/);
});

test("o Kanban declara o recorte que aplicou", () => {
  /**
   * A rota já aplicava o piso certo — provado no navegador: um corretor recebe
   * 195 (a carteira dele) e os parâmetros de dono são ignorados. Mas não DIZIA
   * qual recorte aplicou, então para auditá-la de fora era preciso reler o
   * código.
   *
   * A listagem publica `escopo` desde sempre, e é por isso que ela é
   * auditável. É a diferença entre "está certo" e "dá para provar que está
   * certo" — e foi a falta dessa prova que atrasou a descoberta dos dois
   * vazamentos irmãos de 2026-07-29.
   */
  assert.match(rotaPipeline, /escopo: lideranca \? "organizacao" : "carteira"/,
    "o recorte aplicado precisa viajar na resposta, como já viaja na listagem");
});

test("toda rota que confere o piso também sabe RECUSAR com 403", () => {
  /**
   * `requireLeadAccess` levanta `LeadForaDaCarteiraError`. Quem chama e não
   * reconhece essa classe cai no `catch` genérico da rota — e todos eles
   * escolhem o status testando PALAVRAS da mensagem. A frase "Esta lead está
   * com outra pessoa" não casa com nenhuma régua do repositório, então a
   * recusa vira 400 ("corrija os dados"), 401 ("faça login de novo") ou 500
   * ("o servidor quebrou"), conforme a rota.
   *
   * MEDIDO em /api/v2/messages/send: a rota JÁ recusava — herdou o piso quando
   * `requireLeadAccess` passou a aplicá-lo — mas devolvia 500 e ainda gravava
   * `message.queue_failed` em nível ERROR. Bloqueio certo, resposta errada, e
   * o log de erro enchendo de eventos que não são erro.
   *
   * Esta asserção é por VARREDURA, não por lista: uma rota nova que chame
   * `requireLeadAccess` amanhã e esqueça o mapeamento reprova sozinha. Lista
   * fixa envelheceria em silêncio, que é como esta rota ficou de fora da
   * primeira rodada.
   */
  const raizApp = path.join(raiz, "app");
  const arquivos = [];
  const varrer = (dir) => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const alvo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) varrer(alvo);
      else if (entrada.name.endsWith(".ts")) arquivos.push(alvo);
    }
  };
  varrer(raizApp);

  /**
   * As linhas de `import` saem antes da conferência, e isso NÃO é detalhe: a
   * primeira versão desta asserção procurava `ehLeadForaDaCarteira` no arquivo
   * inteiro, e a mutação M49 (trocar `if (ehLeadForaDaCarteira(error))` por
   * `if (false)`) SOBREVIVEU — o identificador continuava no import, então a
   * asserção seguia verde com o defeito de volta.
   *
   * É a fraqueza que este repositório já pagou várias vezes: provar que a
   * PALAVRA existe não é provar que a rota DECIDE com ela. O que importa é a
   * chamada no corpo.
   */
  const semImports = (src) =>
    src.split("\n").filter((l) => !/^\s*import\b/.test(l)).join("\n");

  const semMapeamento = arquivos.filter((f) => {
    const src = fs.readFileSync(f, "utf8");
    if (!src.includes("requireLeadAccess(")) return false;
    const corpo = semImports(src);
    return !corpo.includes("ehLeadForaDaCarteira(") || !corpo.includes("403");
  });

  assert.deepEqual(
    semMapeamento.map((f) => path.relative(raiz, f)),
    [],
    "estas rotas conferem o piso e devolvem a recusa com o status errado — importe `ehLeadForaDaCarteira` e mapeie para 403",
  );

  // O outro lado: a varredura só vale se estiver de fato encontrando as rotas.
  // Sem este piso, apagar a busca deixaria a lista vazia e o teste verde.
  const comPiso = arquivos.filter((f) => fs.readFileSync(f, "utf8").includes("requireLeadAccess("));
  assert.ok(comPiso.length >= 10,
    `a varredura achou só ${comPiso.length} rotas com o piso; eram 10 em 2026-07-29 — se caiu, ou o piso sumiu de algum lugar ou a busca quebrou`);
});
