import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { checkRateLimit, clientKey } from "@/lib/security/rate-limit";
import { normalizeEmail } from "@/lib/atlas/data-contracts";
import { createRequestContext } from "@/lib/api/core";
import { logger } from "@/lib/observability/logger";
import {
  fraseDoEnvioAceito, TENTATIVAS_POR_EMAIL, JANELA_DO_EMAIL_MS,
  TENTATIVAS_POR_IP, JANELA_DO_IP_MS,
} from "@/lib/security/limite-de-recuperacao";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const meta = createRequestContext(request);
  /**
   * ── O LIMITE PROTEGE A CAIXA POSTAL, NÃO O IP ─────────────────────────────
   *
   * Era `5 por 15 minutos POR IP`, com a chave vinda de `x-forwarded-for`.
   * Medido contra a produção em 03/08/2026, com um corretor real preso do lado
   * de fora:
   *
   *   · QUEM É LEGÍTIMO TRAVAVA. O SMTP embutido do Supabase tem limite próprio
   *     (visto no log: `over_email_send_rate_limit`, 1 envio a cada 57s). A
   *     pessoa não recebe, tenta de novo, e na quinta vez leva 429 — que ela lê
   *     como "o sistema está quebrado".
   *
   *   · QUEM QUER BURLAR, BURLAVA. A mesma chamada que devolvia 429 do meu IP
   *     passou com 202 mandando um `X-Forwarded-For` inventado. O cabeçalho vem
   *     de fora e ninguém o valida.
   *
   * O recurso escasso não é o IP: é a CAIXA POSTAL. Agora a trava principal é
   * por e-mail normalizado (3 em 15 min — atinge o abuso de bombardear alguém),
   * e o IP fica como segunda trava, mais frouxa (20), contra varredura. Ela é
   * frágil por natureza, e por isso NÃO é a principal.
   *
   * O corpo é lido ANTES do limite porque a chave agora depende do e-mail.
   */
  const body = await request.json().catch(() => null) as { email?: string } | null;
  const email = normalizeEmail(body?.email);
  if (!email) return NextResponse.json({ error: "E-mail inválido." }, { status: 400, headers: { "Cache-Control": "no-store" } });

  const porEmail = checkRateLimit(`password-recovery:email:${email}`, {
    limit: TENTATIVAS_POR_EMAIL,
    windowMs: JANELA_DO_EMAIL_MS,
  });
  const porRede = checkRateLimit(clientKey(request, "password-recovery"), {
    limit: TENTATIVAS_POR_IP,
    windowMs: JANELA_DO_IP_MS,
  });
  // A trava do e-mail vem primeiro: é a que a pessoa consegue entender e agir
  // (olhar o spam). Dizer "seu IP" a quem não controla o IP é acusar sem saída.
  const fechada = !porEmail.allowed ? porEmail : !porRede.allowed ? porRede : null;
  if (fechada) {
    const esperar = Math.max(1, Math.ceil((fechada.resetAt - Date.now()) / 1000));
    const minutos = Math.max(1, Math.ceil(esperar / 60));
    return NextResponse.json(
      {
        error: !porEmail.allowed
          ? `Já enviamos ${TENTATIVAS_POR_EMAIL} links para este e-mail há pouco. Confira a caixa de entrada e o SPAM. Se nada chegou, tente de novo em ${minutos} minuto(s).`
          : `Muitos pedidos de recuperação vindos desta rede. Tente de novo em ${minutos} minuto(s).`,
        // A tela pode mostrar um contador em vez de um botão que só recusa.
        esperarSegundos: esperar,
      },
      { status: 429, headers: { "Retry-After": String(esperar), "Cache-Control": "no-store" } },
    );
  }
  const origin = (process.env.ATLAS_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  if (!/^https:\/\/[^/]+/i.test(origin) && process.env.NODE_ENV === "production") return NextResponse.json({ error: "Domínio público de recuperação não configurado." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const safeOrigin = origin || new URL(request.url).origin;
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${safeOrigin}/auth/callback?next=${encodeURIComponent("/redefinir-senha")}` });
  if (error && /rate|too many/i.test(error.message)) return NextResponse.json({ error: "Muitas solicitações. Aguarde alguns minutos." }, { status: 429, headers: { "Cache-Control": "no-store" } });
  if (error) logger.warn("auth.recovery.provider_failed", { requestId: meta.requestId, correlationId: meta.correlationId, errorCode: error.code, status: error.status });
  // A frase antiga ("Se o e-mail estiver cadastrado...") não revelava quem tem
  // conta — e essa parte está certa. Mas deixava a pessoa sem saber o que
  // fazer quando nada chegava, e é aí que ela tenta cinco vezes e trava.
  return NextResponse.json({ accepted: true, message: fraseDoEnvioAceito() }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
