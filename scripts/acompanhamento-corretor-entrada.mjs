/**
 * Gera um magiclink de UMA VEZ para a identidade descartável criada por
 * `acompanhamento-corretor-prova.mjs`, para abrir as telas no navegador sem
 * digitar senha em lugar nenhum.
 *
 *   node --env-file=.env.local scripts/acompanhamento-corretor-entrada.mjs /leads
 *
 * ── POR QUE `localhost` E NÃO `127.0.0.1` ───────────────────────────────────
 *
 * `/auth/callback` redireciona para a origem publicada (ATLAS_BASE_URL), que
 * aqui é `http://localhost:3000`. Chamar o callback em `127.0.0.1` grava o
 * cookie de sessão naquele host e manda o navegador para `localhost` — outra
 * origem, sem cookie nenhum. Medido em 02/08/2026: a tela caía em
 * `/login?next=/leads` e parecia token inválido, quando o token estava certo e
 * quem tinha mudado era o host.
 */
import { createClient } from "@supabase/supabase-js";

const env = process.env;
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: perfis } = await admin
  .from("profiles")
  .select("email")
  .like("email", "acompanhamento-diretor-%@atlas-teste.local")
  .limit(1);
if (!perfis?.length) {
  throw new Error("Nenhuma identidade descartável viva. Rode acompanhamento-corretor-prova.mjs antes.");
}
const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: perfis[0].email });
if (error) throw error;
const destino = process.argv[2] || "/leads";
console.log(
  `${env.ATLAS_PROVA_APP || "http://localhost:3000"}/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink&next=${encodeURIComponent(destino)}`,
);
