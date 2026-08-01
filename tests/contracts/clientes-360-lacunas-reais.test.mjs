/**
 * Contrato das LACUNAS REAIS da carteira.
 *
 * ── O ACHADO ORIGINAL ───────────────────────────────────────────────────────
 *
 * A tela "Clientes 360" existia para dizer o que falta preencher em cada
 * cliente. Ela consultava duas colunas que nunca eram buscadas:
 *
 *   development_id   174/217 preenchidos · ausente do select
 *   purpose          174/217 preenchidos · ausente do select
 *
 * Resultado: 434 lacunas falsas — todos os 217 clientes apareciam como "sem
 * projeto" e "sem finalidade", inclusive os 174 que tinham as duas coisas.
 *
 * **Painel de qualidade que manda preencher o que já está preenchido é pior que
 * painel nenhum**: ensina a operação a ignorá-lo, e aí ele também não serve
 * quando a lacuna é de verdade.
 *
 * ── POR QUE O ARQUIVO MUDOU (2026-07-29) ────────────────────────────────────
 *
 * A tela "Clientes 360" (`app/(crm)/customers/page.tsx`) e sua rota
 * (`app/api/v1/customers/route.ts`) foram APAGADAS. Ela lia a MESMA tabela
 * `leads` que /leads, pela mesma função (`readCompatibleCustomers` era alias de
 * `readCompatibleLeads`), sem SLA, filtros, lote ou ordenação — e, o grave, sem
 * o piso de carteira: a rota chamava o repositório só com
 * `{ organizationId, limit: 5000 }`, sem `ownerId`, delegando a fronteira a um
 * RLS PERMISSIVE por organização. Um corretor via as 469 leads da imobiliária
 * inteira, com telefone e e-mail.
 *
 * O ACHADO, PORÉM, NÃO MORREU COM A TELA — e por isso este contrato continua.
 * As duas regras que antes moravam dentro daquela rota vivem agora na camada de
 * compatibilidade (`lib/compat/legacy-v2.ts`), que é o lugar mais forte: uma
 * fonte só, consumida por TODOS os leitores de lead, em vez de repetida em cada
 * rota — que é exatamente a classe de defeito mais cara deste repositório.
 *
 * Rodar: node --test tests/contracts/clientes-360-lacunas-reais.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const compat = fs.readFileSync(path.join(raiz, "lib", "compat", "legacy-v2.ts"), "utf8");
const carteira = fs.readFileSync(path.join(raiz, "app", "(crm)", "leads", "page.tsx"), "utf8");

/** Colunas do grupo estendido, como o código as declara. */
function colunasEstendidas() {
  const bloco = compat.slice(
    compat.indexOf("NEXT_ACTION_COLUMNS = ["),
    compat.indexOf("] as const", compat.indexOf("NEXT_ACTION_COLUMNS = [")),
  );
  return [...bloco.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

test("o select busca as colunas que o painel de lacunas consulta", () => {
  const colunas = colunasEstendidas();
  for (const coluna of ["development_id", "purpose", "next_action_at"]) {
    assert.ok(colunas.includes(coluna),
      `${coluna} tem dado no banco e o painel a consulta — sem buscá-la, a lacuna é falsa`);
  }
});

test("toda coluna do grupo estendido existe no banco vivo", () => {
  // O fallback é tudo ou nada: uma coluna ausente devolve 42703 e a leitura cai
  // para o select base, perdendo o grupo inteiro — inclusive o SLA. Ja aconteceu
  // com `next_action_label`, que não existe nesta base.
  const conhecidasComoAusentes = ["next_action_label", "profile_type", "interest_type"];
  const intrusas = colunasEstendidas().filter((c) => conhecidasComoAusentes.includes(c));
  assert.deepEqual(intrusas, [],
    "coluna inexistente no grupo estendido derruba a leitura inteira, não só a si mesma");
});

test("a lacuna de projeto aceita a coluna canônica E a legada", () => {
  // Antes esta regra era um `text(lead, "development_id", "project_id")` dentro
  // da rota de clientes — um lugar só, e o lugar errado: qualquer outra tela que
  // lesse lead voltava a marcar lacuna falsa. Hoje ela é do mapeamento, e vale
  // para todo mundo que lê lead.
  assert.match(
    compat,
    /development_id: first\(row, "development_id", "project_id"\)/,
    "a base tem histórico nas duas; exigir só uma marcaria lacuna onde não há",
  );
});

test("a finalidade também pode vir das notas", () => {
  // `mapLegacyLead` faz purpose = coluna || purposeFromNotes(notes). Uma lead
  // com a coluna vazia e "Objetivo declarado: moradia." nas notas TEM
  // finalidade conhecida — cobrá-la seria pedir o que já foi respondido.
  assert.match(compat, /purpose: first\(row, "purpose"\) \|\| purposeFromNotes\(row\.notes\)/);
});

test("a carteira não inventa lacuna de contato quando há telefone OU e-mail", () => {
  // Um dos dois basta para falar com a pessoa. Na tela morta isto era
  // `text(lead, "email", "phone")`; em /leads é a condição que decide se a linha
  // ganha os chips de copiar — mesma regra, agora visível para o corretor.
  assert.match(carteira, /\{lead\.phone \|\| lead\.email \? \(/,
    "exigir os dois esconderia o contato de quem só tem um");
  assert.match(carteira, /copiar tel/);
  assert.match(carteira, /copiar e-mail/);
});

test("os quatro vínculos herdados da tela morta são uma fonte só", () => {
  // Era a única ideia PRÓPRIA de Clientes 360. Se ela tivesse sido reescrita
  // dentro da tela de leads, teríamos de novo a mesma verdade em dois lugares
  // (a tela e a rota) divergindo com o tempo — a classe de defeito mais cara
  // deste repositório. Mora em um módulo, consumido pelos dois.
  const regra = fs.readFileSync(path.join(raiz, "lib", "crm", "vinculo-do-cliente.ts"), "utf8");
  const rota = fs.readFileSync(path.join(raiz, "app", "api", "v1", "crm", "leads", "route.ts"), "utf8");
  assert.match(regra, /export const VINCULOS: readonly VinculoDoCliente\[\]/);
  assert.match(carteira, /from "@\/lib\/crm\/vinculo-do-cliente"/);
  assert.match(rota, /from "@\/lib\/crm\/vinculo-do-cliente"/);
  // "Em atendimento" é o COMPLEMENTO dos três terminais, não uma lista de
  // etapas: etapa nova do funil entra sozinha, sem ninguém lembrar de cadastrar.
  assert.match(regra, /em_atendimento: \[\]/);
  assert.match(rota, /statusForaDoAtendimento\(\)/);
});

test("o vínculo filtra a carteira inteira, não só a página visível", () => {
  // A tela morta segmentava em memória, sobre um lote de 5.000 lidos de uma vez.
  // Aqui o filtro vira cláusula de banco — e por isso continua correto na
  // página 7 e com o piso de carteira aplicado.
  const rota = fs.readFileSync(path.join(raiz, "app", "api", "v1", "crm", "leads", "route.ts"), "utf8");
  assert.match(rota, /params\.get\("vinculo"\)/);
  assert.match(rota, /query\.not\("status", "in", `\(\$\{statusForaDoAtendimento\(\)\.join\(","\)\}\)`\)/);
  assert.match(rota, /query\.in\("status", \[\.\.\.STATUS_DO_VINCULO\[vinculo\]\]\)/);
});

test("a rota que vazava a carteira não pode voltar", () => {
  // `GET /api/v1/customers` chamava readCompatibleCustomers com
  // { organizationId, limit: 5000 } e nenhum ownerId. A política
  // `leads_org_access` é PERMISSIVE por organização: ela NÃO recorta por dono.
  assert.ok(!fs.existsSync(path.join(raiz, "app", "api", "v1", "customers", "route.ts")));
  const rota = fs.readFileSync(path.join(raiz, "app", "api", "v1", "crm", "leads", "route.ts"), "utf8");
  assert.match(rota, /leSoAPropriaCarteira\(access\.access\.profile\)/,
    "o piso de carteira é aplicado em código, não delegado ao RLS");
  assert.match(rota, /filtroDaMinhaCarteira\(access\.access\.user\.id\)/);
});
