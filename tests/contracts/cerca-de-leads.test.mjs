/**
 * Contrato da CERCA DA ORGANIZAÇÃO em `leads`.
 *
 * ── O DEFEITO QUE ISTO FIXA (e ele quase passou) ─────────────────────────────
 *
 * `public.leads` tinha cinco policies, todas PERMISSIVE. Permissivas se somam
 * por OR, então `leads_org_access` (organização inteira, cmd=ALL) engolia as
 * quatro comerciais: elas eram código morto. Medido executando em 2026-07-29 —
 * um corretor de carteira vazia, com a chave publishable e o próprio token,
 * direto no PostgREST: SELECT devolveu as 470 leads da organização, UPDATE
 * mudou a lead de outro dono, DELETE apagou a linha.
 *
 * A migration `20260729140000` faz a cerca virar RESTRICTIVE (combina por AND,
 * só TIRA acesso) e devolve às comerciais o papel de conceder.
 *
 * ── MAS A PRIMEIRA VERSÃO DA CORREÇÃO ESTAVA ERRADA, E ASSIM ────────────────
 *
 * Ela escreveu a lista de liderança como ('director', 'superintendent') e
 * omitiu 'manager' e 'admin'. `VE_O_FUNIL_INTEIRO`, em
 * lib/crm/escopo-de-leitura.ts, tem os quatro.
 *
 * Aplicada, o efeito foi medido impersonando os perfis REAIS: o dono da conta
 * (commercial_role='manager') caiu de 469 leads visíveis para ZERO — abriria o
 * CRM numa tela vazia. A migration escrita para acabar com "duas verdades para
 * o mesmo fato" criou mais uma, no mesmo arquivo em que dizia espelhar o
 * módulo da aplicação.
 *
 * Nenhum dos 597 contratos existentes reprovou. Nenhum deles pergunta o que um
 * gerente enxerga — e a suíte inteira ficaria verde com a policy doente de
 * volta no lugar, porque nada em tests/ olha para o SQL.
 *
 * ── POR QUE ESTE ARQUIVO EXECUTA O MÓDULO EM VEZ DE GREPAR OS DOIS ──────────
 *
 * Grepar `'manager'` nos dois arquivos provaria só que a palavra existe nos
 * dois. O que precisa ser verdade é mais forte: para CADA papel do produto, a
 * resposta do TypeScript e a da lista no SQL têm de ser a MESMA. Por isso o
 * teste chama `leLiderancaInteira` de verdade e confronta papel a papel — os
 * dois lados do filtro, quem entra e quem fica de fora.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { leLiderancaInteira, estaNaMinhaCarteira } from "../../lib/crm/escopo-de-leitura.ts";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const migration = fs.readFileSync(
  path.join(raiz, "supabase", "migrations", "20260729140000_leads_cerca_da_organizacao_e_piso_de_carteira.sql"),
  "utf8",
);

/**
 * O vocabulário de papéis do produto. Vem do banco vivo (medido em 2026-07-29:
 * broker, manager, director em `commercial_role`; `admin` em `role`) mais os
 * que o código nomeia. Papel novo que apareça sem entrar aqui é justamente o
 * que este contrato não cobre — por isso o último teste cobra que a lista do
 * SQL não contenha nada fora deste vocabulário.
 */
const PAPEIS = ["broker", "manager", "director", "superintendent", "admin"];

/** A lista de liderança escrita no SQL, extraída de dentro da função de alcance. */
function liderancaDoSql() {
  const m = migration.match(
    /v\.commercial_role in \(([^)]*)\)/,
  );
  assert.ok(m, "a função de alcance precisa declarar a liderança por lista de papéis");
  return new Set([...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]));
}

test("todo papel que a aplicação trata como liderança está na lista do SQL", () => {
  const noSql = liderancaDoSql();
  for (const papel of PAPEIS) {
    if (!leLiderancaInteira({ commercialRole: papel })) continue;
    assert.ok(
      noSql.has(papel),
      `'${papel}' lê o funil inteiro na aplicação e NÃO está na lista do SQL. ` +
        `Foi exatamente assim que 'manager' sumiu e o dono da conta viu zero leads: ` +
        `o banco devolve 0 linhas e a tela fica vazia, sem erro nenhum.`,
    );
  }
});

test("e nenhum papel a mais — a lista não pode conceder o que a aplicação nega", () => {
  for (const papel of liderancaDoSql()) {
    assert.ok(
      PAPEIS.includes(papel),
      `'${papel}' está na lista do SQL mas não é papel conhecido do produto`,
    );
    assert.ok(
      leLiderancaInteira({ commercialRole: papel }),
      `'${papel}' lê o funil inteiro no BANCO e só a própria carteira na aplicação. ` +
        `Uma cerca mais frouxa que a aplicação devolve pelo PostgREST o que a rota recusa.`,
    );
  }
});

test("o corretor não entra pela porta da liderança", () => {
  // O outro lado do filtro. Sem isto, "todo papel da app está no SQL" seria
  // satisfeito por uma lista com TODOS os papéis dentro — que é o vazamento.
  assert.equal(leLiderancaInteira({ commercialRole: "broker" }), false);
  assert.ok(!liderancaDoSql().has("broker"),
    "corretor na lista de liderança devolve a organização inteira e reabre o buraco");
});

test("o admin sem papel comercial continua sendo liderança nos dois lados", () => {
  // `leLiderancaInteira` termina com `|| input.role === "admin"`. A função do
  // banco precisa do ramo equivalente, senão um admin sem commercial_role cai
  // para "própria carteira" só no banco.
  assert.equal(leLiderancaInteira({ commercialRole: null, role: "admin" }), true);
  assert.match(migration, /papel_bruto = 'admin'/,
    "falta o ramo do papel bruto: admin sem papel comercial ficaria sem alcance no banco");
});

test("a cerca é RESTRICTIVE — permissiva seria o defeito de volta", () => {
  assert.match(migration, /create policy leads_org_fence on public\.leads\s*\n\s*as restrictive/,
    "PERMISSIVE se soma por OR e volta a engolir as comerciais; RESTRICTIVE combina por AND");
  // Ancorado no INÍCIO DA LINHA de propósito. Sem `^...m`, esta asserção
  // reprova por causa do bloco de rollback que vive dentro de um comentário —
  // e o conserto óbvio seria apagar a explicação junto com o defeito. Já
  // aconteceu três vezes neste repositório: case a declaração executável, não
  // a palavra solta.
  assert.doesNotMatch(migration, /^create policy leads_org_access/m,
    "a policy antiga não pode ser recriada por este arquivo (o rollback, em comentário, pode citá-la)");
});

test("a lead sem dono é alcançável — é assim que ela é adotada", () => {
  // O gêmeo em JavaScript e a função do banco têm de concordar caso a caso.
  assert.equal(estaNaMinhaCarteira("eu", { assigned_to: null, assigned_user_id: null }), true);
  assert.match(migration, /lead_assigned_to is null and lead_assigned_user_id is null/,
    "sem esta cláusula a lead sem dono fica invisível e nunca é adotada — a fila de entrada congela");
});

test("mas apagar lead sem dono NÃO é adotar", () => {
  /**
   * Medido com a primeira versão já aplicada: um corretor de fora da subárvore
   * fez DELETE numa lead órfã pelo PostgREST e a linha SUMIU. A cláusula órfã
   * existe para a lead ser VISTA e ATUALIZADA; as quatro policies chamavam a
   * mesma função, então ela também autorizava o DELETE.
   *
   * Hoje há 0 órfãs — mas a fila de entrada NASCE órfã.
   */
  const delet = migration.slice(migration.indexOf("function private.pode_apagar_lead"));
  assert.ok(delet.length > 0, "a regra do apagar precisa existir separada da regra de alcance");
  const corpo = delet.slice(0, delet.indexOf("$function$;"));
  assert.doesNotMatch(corpo, /lead_assigned_to is null and lead_assigned_user_id is null/,
    "com a cláusula órfã aqui, qualquer corretor apaga a fila de entrada não distribuída");
  assert.match(migration, /create policy leads_commercial_delete[\s\S]{0,200}pode_apagar_lead/,
    "a policy de DELETE precisa usar a regra estrita, não a de alcance");
});
