/**
 * A PONTE AVISA QUE O ESTADO DE UMA SESSÃO MUDOU.
 *
 * Conexão de WhatsApp muda sozinha: o corretor lê o QR, o celular fica sem
 * internet, o WhatsApp derruba a sessão às 3h da manhã. Se o banco só fosse
 * atualizado quando alguém abre a tela, o painel da liderança mostraria
 * "conectado" para quem caiu há seis horas — o mesmo defeito da bandeira de
 * disponibilidade que ninguém abaixa.
 *
 * O QR NÃO é aceito aqui, mesmo que venha no corpo: é a chave de pareamento e
 * não tem por que ser gravada.
 */

import { type NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { segredoDaPonte, type StatusSessao } from "@/lib/whatsapp/bridge-contract";

export const dynamic = "force-dynamic";

const STATUS_VALIDOS: readonly StatusSessao[] = [
  "desconectado", "aguardando_qr", "conectado", "falhou", "banido",
];

function segredoConfere(recebido: string | null, esperado: string): boolean {
  if (!recebido || recebido.length !== esperado.length) return false;
  let diferenca = 0;
  for (let i = 0; i < esperado.length; i += 1) {
    diferenca |= recebido.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return diferenca === 0;
}

export async function POST(request: NextRequest) {
  const esperado = segredoDaPonte();
  if (!esperado) return NextResponse.json({ error: "bridge disabled" }, { status: 503 });
  if (!segredoConfere(request.headers.get("x-atlas-bridge-secret"), esperado)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const corpo = (await request.json().catch(() => null)) as {
    profileId?: string; status?: string; phoneE164?: string | null;
    erro?: string | null; conectadoEm?: string | null; ultimaAtividadeEm?: string | null;
  } | null;

  const profileId = corpo?.profileId;
  const status = corpo?.status as StatusSessao | undefined;
  if (!profileId || !status || !STATUS_VALIDOS.includes(status)) {
    return NextResponse.json({ error: "profileId e status válidos são obrigatórios" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // A organização vem do perfil, não do corpo: aceitar do corpo deixaria a
  // ponte gravar sessão em organização alheia se algum dia o segredo vazasse.
  const { data: perfil } = await admin
    .from("profiles").select("organization_id").eq("id", profileId).maybeSingle();
  if (!perfil?.organization_id) {
    return NextResponse.json({ error: "perfil desconhecido" }, { status: 404 });
  }

  const agora = new Date().toISOString();
  const { error } = await admin.from("whatsapp_broker_sessions").upsert({
    organization_id: perfil.organization_id,
    profile_id: profileId,
    status,
    phone_e164: corpo?.phoneE164 ?? null,
    last_error: corpo?.erro ?? null,
    connected_at: status === "conectado" ? (corpo?.conectadoEm ?? agora) : null,
    disconnected_at: status === "conectado" ? null : agora,
    last_activity_at: corpo?.ultimaAtividadeEm ?? null,
    updated_at: agora,
  }, { onConflict: "profile_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
