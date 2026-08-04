import { NextResponse, type NextRequest } from "next/server";
import { requireApiIdentity } from "@/lib/security/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { isDirectorProfile, enforceRateLimit } from "@/lib/api/security";
import { lerCartaMorta } from "@/lib/integrations/carta-morta";

export const dynamic = "force-dynamic";

type RetryPayload = { eventId?: string };

export async function POST(request: NextRequest) {
  // Reprocessar fila morta reenfileira trabalho; sem teto, um clique nervoso
  // multiplica a fila em vez de drená-la.
  const rate = enforceRateLimit(request, { limit: 10, windowMs: 60_000, scope: "v3.dlq.retry" });
  if (!rate.ok) return rate.response;
  try {
    const identity = await requireApiIdentity(request);
    const body = (await request.json()) as RetryPayload;
    if (!body.eventId) return NextResponse.json({ error: "eventId é obrigatório." }, { status: 400 });

    const admin = getSupabaseAdmin();
    const { data: profile } = await admin
      .from("profiles")
      .select("role,commercial_role")
      .eq("id", identity.userId)
      .eq("organization_id", identity.organizationId)
      .single();

    if (!profile || !isDirectorProfile({ role: profile.role, commercial_role: profile.commercial_role })) {
      return NextResponse.json({ error: "Reprocessamento de integrações é exclusivo da diretoria." }, { status: 403 });
    }

    const { data: deadLetter, error: readError } = await admin
      .from("dead_letter_events")
      .select("id,outbox_event_id,resolved")
      .eq("id", body.eventId)
      .eq("organization_id", identity.organizationId)
      .single();

    if (readError || !deadLetter) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
    if (deadLetter.resolved) return NextResponse.json({ error: "Evento já resolvido." }, { status: 409 });
    if (!deadLetter.outbox_event_id) return NextResponse.json({ error: "Evento sem vínculo com a outbox." }, { status: 422 });

    /* ── A TRAVA DA CAUSA ────────────────────────────────────────────────────
     *
     * MUDANÇA DE COMPORTAMENTO (02/08/2026). Até aqui esta rota reenfileirava
     * QUALQUER carta morta que tivesse vínculo com a outbox, sem olhar por que
     * ela morreu. Reprocessar evento cuja causa continua de pé só o mata de
     * novo: ele gasta as mesmas 5 tentativas, volta para esta tabela e volta
     * com a idade ZERADA — a linha fica mais nova do que o problema.
     *
     * Pior: `resolved` era marcado como `true` no mesmo movimento. Ou seja, o
     * evento saía da fila morta marcado como RESOLVIDO enquanto ia morrer de
     * novo. A contagem melhorava e a entrega não acontecia.
     *
     * O veredito é o MESMO módulo que a tela usa para desenhar o botão
     * (lib/integrations/causa-da-carta-morta.ts). Tela e servidor não podem
     * discordar sobre a mesma linha — quando discordam, o operador vê botão
     * ligado e recebe recusa, ou vê botão desligado sobre um evento que
     * voltaria bem.
     *
     * A trava vale mesmo com a tela dizendo o contrário: cliente é sugestão. */
    const leitura = await lerCartaMorta(admin, identity.organizationId, { incluirResolvidas: false });
    if (!leitura.ok) {
      // Não conseguir atestar a causa NÃO libera o reprocesso. Na dúvida, o
      // evento fica onde está: parado ele ainda pode ser recuperado, morto de
      // novo ele perde a idade e a rastreabilidade.
      logger.error("v3.dlq_causa_ilegivel", { deadLetterId: deadLetter.id, motivo: leitura.motivo });
      return NextResponse.json(
        { error: "Não foi possível atestar se a causa desta falha foi corrigida. Reprocessar às cegas mataria o evento de novo.", motivo: leitura.motivo },
        { status: 503 },
      );
    }

    const diagnostico = leitura.linhas.find((l) => l.id === deadLetter.id);
    if (!diagnostico) {
      return NextResponse.json({ error: "Evento não encontrado entre as cartas mortas abertas." }, { status: 404 });
    }
    if (!diagnostico.veredito.podeReprocessar) {
      logger.info("v3.dlq_reprocesso_barrado", {
        deadLetterId: deadLetter.id,
        familia: diagnostico.veredito.familia,
        causaResolvida: diagnostico.veredito.causaResolvida,
      });
      return NextResponse.json(
        {
          error: diagnostico.veredito.bloqueio ?? "A causa desta falha continua de pé.",
          causa: diagnostico.veredito.causaLegivel,
          comoResolver: diagnostico.veredito.comoResolver,
          precondicoes: diagnostico.veredito.precondicoes,
        },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    /* `.select("id")` nas duas escritas, e a contagem conferida.
     *
     * No PostgREST, um UPDATE que não casa com linha nenhuma responde 200 e
     * `error: null` — exatamente o que o código antigo lia como sucesso. Se o
     * `organization_id` não batesse, ou a linha do outbox já tivesse sido
     * removida, esta rota respondia "requeued" sem ter reenfileirado nada, e a
     * carta morta era marcada RESOLVIDA logo abaixo. A conversão sumia da fila
     * morta sem nunca ter voltado para a fila viva. */
    const outbox = await admin
      .from("integration_outbox")
      .update({ status: "pending", attempts: 0, available_at: now, locked_at: null, locked_by: null, last_error: null })
      .eq("id", deadLetter.outbox_event_id)
      .eq("organization_id", identity.organizationId)
      .select("id");
    if (outbox.error) throw outbox.error;
    if (!outbox.data?.length) {
      logger.error("v3.dlq_outbox_nao_reenfileirado", { deadLetterId: deadLetter.id, outboxEventId: deadLetter.outbox_event_id });
      return NextResponse.json(
        { error: "A linha da fila de entrega não foi encontrada para reenfileirar. Nada foi alterado, e o evento continua na carta morta." },
        { status: 422 },
      );
    }

    /* A ordem importa e é deliberada: o outbox volta PRIMEIRO. Se a marcação de
     * resolvida falhar depois, o pior caso é uma carta morta que continua
     * aparecendo na tela com a entrega já a caminho — visível e corrigível. A
     * ordem inversa produziria o pior caso oposto: linha marcada resolvida com
     * a entrega parada, que é invisível e é o defeito que esta fase combate. */
    const resolvida = await admin
      .from("dead_letter_events")
      .update({ resolved: true, resolved_at: now, resolved_by: identity.userId })
      .eq("id", deadLetter.id)
      .eq("organization_id", identity.organizationId)
      .select("id");
    if (resolvida.error) throw resolvida.error;
    if (!resolvida.data?.length) {
      logger.error("v3.dlq_marcacao_nao_gravou", { deadLetterId: deadLetter.id });
      return NextResponse.json(
        { error: "O evento foi reenfileirado, mas a carta morta NÃO ficou marcada como resolvida. Ela continuará listada.", outboxEventId: deadLetter.outbox_event_id },
        { status: 500 },
      );
    }

    logger.info("v3.dlq_requeued", { deadLetterId: deadLetter.id, outboxEventId: deadLetter.outbox_event_id, userId: identity.userId });
    return NextResponse.json({ status: "requeued", eventId: deadLetter.id, outboxEventId: deadLetter.outbox_event_id });
  } catch (error) {
    logger.error("v3.dlq_retry_failed", error);
    // Recusa de ACESSO não é falha de servidor. Sem esta régua, perfil inativo,
    // organização suspensa e sessão expirada viravam HTTP 500 — "o servidor
    // quebrou" — e quem lê um 500 não procura o diretor.
    const mensagem = error instanceof Error ? error.message : "Falha ao reprocessar evento.";
    const acesso = /sess[ãa]o|token|autentica|autoriz|organiza|escopo/i.test(mensagem);
    return NextResponse.json({ error: mensagem }, { status: acesso ? 401 : 500 });
  }
}
