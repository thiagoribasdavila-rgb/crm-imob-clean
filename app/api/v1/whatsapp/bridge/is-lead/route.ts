/**
 * "ESTE NÚMERO É UMA LEAD?"
 *
 * A ponte pergunta ANTES de mandar qualquer conteúdo. Recebe só o telefone,
 * devolve sim ou não.
 *
 * ── Por que uma rota só para isso ───────────────────────────────────────────
 *
 * A regra é: o CRM grava conversa de LEAD, não a vida particular do corretor.
 * Dava para receber tudo e descartar o que não é lead — mas aí o texto da
 * conversa do corretor com a mãe dele já teria trafegado, entrado em log de
 * requisição e passado por memória do servidor antes de ser jogado fora.
 *
 * Perguntando primeiro, a mensagem particular **nunca sai do processo da
 * ponte**. O que trafega é um número de telefone e um sim/não.
 *
 * É a diferença entre "não guardamos" e "não recebemos". O corretor está
 * botando o WhatsApp pessoal dele dentro de uma ferramenta da empresa; a
 * segunda é a única promessa que dá para cumprir de verdade.
 */

import { type NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { segredoDaPonte, paraE164 } from "@/lib/whatsapp/bridge-contract";

export const dynamic = "force-dynamic";

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
    organizationId?: string; contatosE164?: string[];
  } | null;

  const organizationId = corpo?.organizationId;
  const contatos = Array.isArray(corpo?.contatosE164)
    ? [...new Set(corpo.contatosE164.map((c) => paraE164(String(c))).filter(Boolean))].slice(0, 200)
    : [];

  if (!organizationId || !contatos.length) {
    return NextResponse.json({ leads: [] });
  }

  // Só o id e o telefone. Nome, e-mail e histórico não têm por que sair daqui:
  // a ponte precisa saber SE grava, não quem é a pessoa.
  const { data, error } = await getSupabaseAdmin()
    .from("leads")
    .select("phone_normalized")
    .eq("organization_id", organizationId)
    .in("phone_normalized", contatos);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    leads: [...new Set((data ?? []).map((l) => l.phone_normalized).filter(Boolean))],
  });
}
