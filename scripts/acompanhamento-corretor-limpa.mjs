/**
 * Apaga as identidades descartáveis criadas por
 * `scripts/acompanhamento-corretor-prova.mjs`.
 *
 *   node --env-file=.env.local scripts/acompanhamento-corretor-limpa.mjs
 *
 * Só toca em e-mails `acompanhamento-*@atlas-teste.local`. Nenhum dado de lead,
 * movimentação ou perfil real é alterado.
 */
import { createClient } from "@supabase/supabase-js";

const env = process.env;
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: perfis, error } = await admin
  .from("profiles")
  .select("id,email")
  .like("email", "acompanhamento-%@atlas-teste.local");
if (error) throw new Error(error.message);

let apagados = 0;
for (const perfil of perfis ?? []) {
  await admin.from("profiles").delete().eq("id", perfil.id);
  await admin.auth.admin.deleteUser(perfil.id);
  apagados += 1;
  console.log(`removido: ${perfil.email}`);
}
console.log(`\n${apagados} identidade(s) descartável(is) removida(s).`);
