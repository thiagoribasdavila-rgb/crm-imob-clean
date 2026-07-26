/**
 * Teste adversarial do PROVISIONAMENTO DE PERFIL NO CADASTRO.
 *
 * Este portão existe por causa de um bug que ficou invisível por semanas e
 * derrubava a autenticação inteira:
 *
 *   O gatilho de provisionamento tinha `exception when others` para absorver
 *   falhas. Só que o tratador registrava o erro com `pg_catalog.sqlerrm` — e
 *   `sqlerrm` é VARIÁVEL de PL/pgSQL, não função. Qualificada com schema, o
 *   Postgres a lê como `tabela.coluna` e levanta 42P01. Ou seja: o mecanismo
 *   que deveria conter o erro era ele próprio um erro, e transformava qualquer
 *   falha de provisionamento em queda de statement.
 *
 *   Efeito medido em 2026-07-26: POST /auth/v1/verify devolvia HTTP 500. Isso
 *   atinge magiclink e RECUPERAÇÃO DE SENHA. A tabela user_provisioning_failures
 *   nunca recebeu uma linha — não porque nada falhava, mas porque falhar em
 *   registrar a falha derrubava tudo antes.
 *
 * A causa primária era a segunda armadilha: o upsert do perfil trazia
 * `on conflict (id) do update set organization_id = excluded.organization_id`,
 * que MOVIA um usuário já existente para a organização padrão vazia sempre que
 * ele confirmasse um e-mail. O supervisor ficava para trás, o gatilho de RBAC
 * recusava — corretamente — e o tratador quebrado convertia a recusa em 500.
 *
 * Os casos abaixo protegem as duas coisas, em TODAS as migrations: nenhuma
 * função pode qualificar `sqlerrm`, e o provisionamento vigente não pode
 * reprovisionar quem já tem perfil.
 *
 * 100% determinístico: só lê arquivos do repo.
 *
 * Rodar da raiz do repo: node scripts/check-auth-provisioning-safety.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = path.join(root, "supabase", "migrations");

const falhas = [];
let passaram = 0;
const check = (nome, ok, detalhe = "") => {
  if (ok) passaram += 1;
  else falhas.push(`${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};

const arquivos = fs.existsSync(MIGRATIONS)
  ? fs.readdirSync(MIGRATIONS).filter((n) => n.endsWith(".sql")).sort()
  : [];
check("caso 1: as migrations existem", arquivos.length > 0, "supabase/migrations vazio");

// --- a armadilha que quebrou o login ----------------------------------------
// `sqlerrm` e `sqlstate` são variáveis de PL/pgSQL. Qualificar com schema é erro
// em tempo de EXECUÇÃO — só aparece quando algo já falhou, que é exatamente o
// pior momento para descobrir.
//
// A varredura considera a ÚLTIMA definição de cada função, e não o histórico:
// migration antiga que já foi substituída descreve o passado, e o que derruba
// produção é o estado final do schema.
const definicaoVigente = new Map();
for (const nome of arquivos) {
  const conteudo = fs.readFileSync(path.join(MIGRATIONS, nome), "utf8");
  const codigo = conteudo.split("\n").filter((linha) => !linha.trimStart().startsWith("--")).join("\n");
  for (const achado of codigo.matchAll(/create (?:or replace )?function\s+([a-z_]+\.[a-z_]+)\s*\(/gi)) {
    const inicio = achado.index ?? 0;
    const proxima = codigo.slice(inicio + 1).search(/create (?:or replace )?function\s/i);
    definicaoVigente.set(achado[1].toLowerCase(), {
      arquivo: nome,
      corpo: proxima < 0 ? codigo.slice(inicio) : codigo.slice(inicio, inicio + 1 + proxima),
    });
  }
}

const qualificadas = [...definicaoVigente.entries()]
  .filter(([, def]) => /\b[a-z_]+\.(sqlerrm|sqlstate)\b/i.test(def.corpo))
  .map(([funcao, def]) => `${funcao} (${def.arquivo})`);
check(
  "caso 2: nenhuma função vigente qualifica sqlerrm/sqlstate com schema",
  qualificadas.length === 0,
  qualificadas.length
    ? `${qualificadas.join(", ")} — o tratador de exceção vira exceção e derruba a autenticação`
    : "",
);

// --- o provisionamento vigente ----------------------------------------------
const provisionadoras = arquivos.filter((nome) =>
  fs.readFileSync(path.join(MIGRATIONS, nome), "utf8").includes("function public.handle_new_auth_user()"));
check("caso 3: existe migration de provisionamento de perfil", provisionadoras.length > 0);

const vigente = provisionadoras[provisionadoras.length - 1];
const texto = vigente ? fs.readFileSync(path.join(MIGRATIONS, vigente), "utf8") : "";
const corpo = texto.slice(texto.indexOf("create or replace function public.handle_new_auth_user()"));

if (corpo) {
  check(
    "caso 4: o provisionamento NÃO move a organização de quem já tem perfil",
    !/on conflict \(id\) do update[\s\S]{0,200}organization_id\s*=\s*excluded\.organization_id/.test(corpo),
    "reprovisionar usuário existente o arranca da organização real a cada confirmação de e-mail",
  );
  check(
    "caso 5: perfil já existente sai por um caminho próprio, antes do upsert",
    /perfil_existente[\s\S]{0,400}return new;/.test(corpo),
    "sem essa saída antecipada, todo login confirmado passa pelo caminho de cadastro",
  );
  check(
    "caso 6: registrar falha não pode derrubar a autenticação",
    /exception[\s\S]{0,600}begin[\s\S]{0,400}user_provisioning_failures[\s\S]{0,300}exception when others then[\s\S]{0,80}null;/.test(corpo),
    "o insert de log precisa viver em bloco próprio com saída silenciosa",
  );
  check(
    "caso 7: o gatilho sempre devolve new, mesmo em falha",
    (corpo.match(/return new;/g) ?? []).length >= 3,
    "um caminho que não devolve new aborta a operação de auth",
  );
  check(
    "caso 8: usuário novo nasce inativo, exceto o primeiro da organização",
    /primeiro_perfil/.test(corpo) && !/active\s*\)?\s*values[\s\S]{0,400}true\s*\)/.test(corpo),
    "nada pode nascer ativo por conta própria",
  );
  check(
    "caso 9: a organização do usuário novo é buscada, não presumida",
    /raw_app_meta_data ->> 'organization_id'/.test(corpo),
    "sem olhar o claim, todo cadastro cai na organização padrão vazia",
  );
}

// ---------------------------------------------------------------------------
console.log(`\ncheck-auth-provisioning-safety: ${passaram} passaram, ${falhas.length} falharam.`);
if (falhas.length) {
  for (const f of falhas) console.error(`  FALHOU: ${f}`);
  process.exit(1);
}
