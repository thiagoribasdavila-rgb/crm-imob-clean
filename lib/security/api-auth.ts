import "server-only";
import { createClient } from "@supabase/supabase-js";

export type ApiIdentity = {
  userId: string;
  organizationId: string;
};

export async function requireApiIdentity(request: Request): Promise<ApiIdentity> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase público não configurado.");
  if (!token) throw new Error("Token de autenticação ausente.");

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) throw new Error("Sessão inválida ou expirada.");

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("organization_id")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    throw new Error("Usuário sem organização vinculada.");
  }

  return { userId: userData.user.id, organizationId: profile.organization_id };
}
