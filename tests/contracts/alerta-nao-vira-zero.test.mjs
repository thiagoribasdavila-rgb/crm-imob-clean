/**
 * Contrato do AVISO DE LEAD NOVA.
 *
 * ── A REGRA QUE ISTO IMPÕE ───────────────────────────────────────────────────
 *
 * "Não consegui verificar" e "não há nada" são coisas DIFERENTES, e um badge
 * mostrando "0" sobre uma fila que ninguém conseguiu ler confirma a falsa
 * tranquilidade em vez de denunciá-la. É a regra do projeto (ausência de dado
 * nunca vira zero) na superfície onde ela mais custa: hoje há leads pagas
 * paradas, e o aviso é o que decide se alguém liga.
 *
 * E há um terceiro estado que também não pode virar pixel: `nenhuma`. A
 * primeira versão desta barra desenhava uma pastilha com "0" ao lado de Leads
 * o tempo todo — ruído permanente, e só apareceu porque abri o navegador.
 *
 * Prova comportamental viva: scripts/prova-alerta-de-lead-nova.mjs (11/11 —
 * retrodatação da Meta, importação em lote, distribuição, recorte por carteira,
 * colega não vê, marcar como visto e voltar a acender).
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");

const gancho = ler("components", "atlas", "use-alerta-de-lead-nova.ts");
const barra = ler("components", "atlas", "sidebar.tsx");
const rota = ler("app", "api", "v1", "crm", "alertas-de-lead", "route.ts");
const migration = ler("supabase", "migrations", "20260729120000_alerta_de_lead_nova.sql");

test("falha de leitura vira 'não medido', nunca zero", () => {
  assert.match(gancho, /setEstado\("nao-medido"\)/,
    "o catch precisa declarar que não mediu");
  assert.doesNotMatch(gancho, /catch\s*\{[^}]*setNovas\(0\)/s,
    "zerar no catch transformaria falha de rede em 'nenhuma lead nova'");
  assert.match(rota, /status: 503/,
    "a rota devolve 503 em falha de leitura — 200 com zero seria indistinguível de 'nada chegou'");
});

test("número velho envelhece em vez de continuar valendo", () => {
  assert.match(gancho, /const VALIDADE_MS = 180_000/,
    "sem prazo de validade, um número lido há uma hora seria mostrado como se fosse de agora");
  assert.match(gancho, /setTimeout\(\(\) => setEstado\("nao-medido"\)/,
    "passado o prazo, o estado precisa se rebaixar sozinho");
});

test("'nenhuma' não desenha pastilha", () => {
  assert.match(barra, /alerta\.estado === "chegou" \|\| alerta\.estado === "nao-medido"/,
    'pastilha com "0" permanente ao lado de Leads é ruído, e foi o defeito da primeira versão');
});

test("a animação dispara na subida, não a cada releitura", () => {
  assert.match(gancho, /setChegouAgora\(total > anterior\.current\)/,
    "pulsar a cada ciclo com o mesmo número é o que treina o olho a ignorar o aviso");
});

test("importação em lote não gera aviso", () => {
  assert.match(migration, /if new\.import_batch_id is not null then\s*\n\s*return new;/,
    "269 leads entraram em um minuto em 28/07 — uma linha de aviso para cada é bolinha vermelha permanente");
});

test("distribuição avisa, não só criação", () => {
  assert.match(migration, /after update of assigned_user_id on public\.leads/,
    "para o corretor a lead 'entra' num UPDATE: as 443 nunca contatadas serão distribuídas, não criadas");
  assert.match(migration, /new\.assigned_user_id is distinct from old\.assigned_user_id/,
    "só quando o dono REALMENTE muda");
});

test("o carimbo é do banco, não da origem", () => {
  assert.match(migration, /detectado_em timestamptz not null default now\(\)/,
    "leads.created_at vem retrodatado do Facebook em até 363 horas — cursorar por ele diria 'nada novo'");
});

test("o recorte por papel é o mesmo na leitura e na baixa", () => {
  const ocorrencias = [...rota.matchAll(/destinatario_id\.eq\.\$\{perfilId\},destinatario_id\.is\.null/g)];
  assert.equal(ocorrencias.length, 2,
    "GET e POST precisam usar o MESMO recorte; divergir faria alguém dar baixa no aviso de outra pessoa");
  assert.match(rota, /leLiderancaInteira/,
    "a regra de quem vê o quê vem do módulo compartilhado, nunca reimplementada");
});

test("o navegador não fala direto com a tabela", () => {
  assert.match(migration, /using \(false\) with check \(false\)/,
    "RLS negando tudo: a rota lê com service_role e aplica o recorte em código — foi delegar isso ao RLS que fez /customers vazar carteira");
  assert.doesNotMatch(gancho, /supabase\.channel|postgres_changes/,
    "assinar realtime daria ao corretor o payload completo de leads dos colegas, sem passar pela aplicação");
});
