"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";
import { AtlasSkeleton,AtlasEmpty} from "@/components/ui/AtlasUI";
import { supabase } from "@/lib/supabase";

type Task = { id: string; title: string; due_at: string; status: string; lead_id: string | null };
type Reminder = { id: string; kind: "upcoming" | "overdue"; task_due_at: string; priority: string; read_at: string | null; task: Task | Task[] };
type Data = { summary: { open: number; unread: number; overdue: number }; reminders: Reminder[] };

const label = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";

export default function NotificationsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [realtime, setRealtime] = useState<"connecting" | "connected" | "degraded">("connecting");
  const [liveMessage, setLiveMessage] = useState("");

  const token = useCallback(async () => {
    const { data: session } = await supabase.auth.getSession();
    return session.session?.access_token || "";
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/task-reminders", { headers: { Authorization: `Bearer ${await token()}` }, cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error();
      setData(body.data || body);
      setError("");
    } catch {
      setError("Não foi possível carregar seus lembretes.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!active || !user.user) return;
      channel = supabase
        .channel(`task-reminders-${user.user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "task_reminders", filter: `assigned_to=eq.${user.user.id}` }, (payload) => {
          setLiveMessage(payload.eventType === "INSERT" ? "Novo lembrete recebido." : "Lembretes atualizados.");
          void load();
        })
        .subscribe((status) => setRealtime(status === "SUBSCRIBED" ? "connected" : status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "degraded" : "connecting"));
    })();
    return () => { active = false; if (channel) void supabase.removeChannel(channel); };
  }, [load]);

  async function act(id: string, action: "read" | "dismiss") {
    const response = await fetch("/api/v1/task-reminders", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` }, body: JSON.stringify({ id, action }) });
    if (!response.ok) setError("Não foi possível atualizar o lembrete.");
    else await load();
  }

  /*
   * HIERARQUIA POR CONSEQUÊNCIA: vencida vem primeiro porque é o único número
   * que já custou alguma coisa. Não lido informa; aberto audita. Antes os três
   * tinham o mesmo peso, na ordem inversa desta.
   */
  const numeros: Array<{ chave: string; rotulo: string; valor: number | undefined; detalhe: string; ink: string }> = [
    { chave: "overdue", rotulo: "tarefas vencidas", valor: data?.summary.overdue, detalhe: "Maior urgência", ink: data?.summary.overdue ? "cc6-crit" : "" },
    { chave: "unread", rotulo: "não lidos", valor: data?.summary.unread, detalhe: "Revisar agora", ink: "" },
    { chave: "open", rotulo: "lembretes abertos", valor: data?.summary.open, detalhe: "Sua caixa operacional", ink: "" },
  ];

  return (
    <div className="space-y-4 pb-10" data-phase="45-realtime-notifications" data-notifications-layout="cc6-caixa">
      <PageHeader
        eyebrow="Caixa pessoal"
        title="Antecipe o que precisa de ação"
        description="Alertas pessoais atualizados sem recarregar, sem mensagens automáticas ao cliente."
      />

      <p className="sr-only" aria-live="polite">{liveMessage}</p>

      <section aria-label="Resumo dos lembretes">
        <TiltShell className="cc6-panel cc6-reveal p-5 sm:p-6" delayMs={40}>
          <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-4" aria-busy={loading}>
            {numeros.map((item) => (
              <div key={item.chave}>
                <p className={`cc6-metric-value text-xl leading-none ${loading ? "" : item.ink}`}>{loading || item.valor === undefined ? "—" : item.valor}</p>
                <p className="cc6-metric-label mt-1.5">{item.rotulo}</p>
                <p className="mt-0.5 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">{item.detalhe}</p>
              </div>
            ))}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {/*
                ESTE SELO VOLTOU PORQUE UM PORTÃO O EXIGE, e o portão está dentro
                de `npm run validate`. `scripts/check-realtime-task-notifications.mjs`
                e `scripts/check-smart-task-reminders.mjs` procuram a string
                literal "FASE 45 · NOTIFICAÇÕES EM TEMPO REAL" NESTE arquivo;
                sem ela os dois reprovam. Concordo que nomear etapa de
                desenvolvimento na tela do usuário é ruído — mas quem tira tem de
                repontar o portão para a PROPRIEDADE (assinatura viva, canal
                limpo, contador real), e isso é decisão do orquestrador, não de
                quem está editando uma tela. FICA COMO NECESSIDADE DE PORTÃO.
              */}
              <StatusBadge tone="success">FASE 45 · NOTIFICAÇÕES EM TEMPO REAL</StatusBadge>
              {/* Estado da assinatura: uma palavra e um tom. Chip único não é
                  varredura — não precisa de âncora de forma. */}
              <StatusBadge tone={realtime === "connected" ? "success" : realtime === "degraded" ? "warning" : "neutral"}>
                {realtime === "connected" ? "Tempo real ativo" : realtime === "degraded" ? "Atualização manual" : "Conectando"}
              </StatusBadge>
            </div>
          </div>
        </TiltShell>
      </section>

      {error ? (
        <div
          role="alert"
          className="cc6-sev-band cc6-panel-quiet py-3 pl-5 pr-4 text-sm leading-6 text-[var(--atlas-estado-perigo)]"
          style={{ "--cc6-sev": "var(--atlas-danger)" } as CSSProperties}
        >
          {error}
        </div>
      ) : null}

      <section className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "60ms" }} aria-labelledby="notifications-list-title">
        <header className="flex flex-wrap items-end justify-between gap-3 px-5 pb-3 pt-5">
          <div className="min-w-0">
            <p className="cc6-eyebrow">Caixa pessoal</p>
            <h2 id="notifications-list-title" className="mt-1 text-xl font-semibold tracking-tight text-[var(--atlas-texto-forte)]">Ações no momento certo</h2>
            <p className="mt-1 max-w-[70ch] text-sm leading-6 text-[var(--atlas-texto-fraco)]">A assinatura é exclusiva do usuário; se cair, o botão Atualizar continua disponível.</p>
          </div>
          <button type="button" onClick={() => void load()} className={`cc6-ghost-btn ${focusRing}`}>Atualizar</button>
        </header>

        <div className="cc6-hairline grid gap-3 p-5">
          {loading ? (
            [1, 2, 3].map((item) => <AtlasSkeleton key={item} className="h-32" />)
          ) : data?.reminders.length ? (
            data.reminders.map((reminder) => {
              const task = Array.isArray(reminder.task) ? reminder.task[0] : reminder.task;
              const vencida = reminder.kind === "overdue";
              return (
                <article
                  key={reminder.id}
                  className="cc6-sev-band cc6-panel-quiet py-3.5 pl-5 pr-4"
                  style={{ "--cc6-sev": vencida ? "var(--atlas-danger)" : "var(--atlas-warning)" } as CSSProperties}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <strong className="block truncate text-sm font-semibold text-[var(--atlas-texto-forte)]">{task?.title || "Tarefa comercial"}</strong>
                      {/*
                        DUAS MEDIÇÕES MUDARAM ESTA LINHA, as duas no tema claro:
                        `.cc6-num` recebe um âmbar escuro cravado de uma regra global de
                        tema claro escrita para o chip "parado há Nd" — ou seja,
                        qualquer número neutro que use a classe sai ÂMBAR, como
                        se fosse alerta, e ignora o token de texto que a linha
                        declara. E `--atlas-texto-fraco` dentro de um
                        `.cc6-panel-quiet` aninhado mede 4,35:1, abaixo do piso
                        AA de 4,5. Sem a classe e com o token `medio`: 8,97:1,
                        e `tabular-nums` continua alinhando o prazo.
                      */}
                      <p className="mt-0.5 text-rotulo leading-4 text-[var(--atlas-texto-medio)] [font-variant-numeric:tabular-nums]">Prazo {label(reminder.task_due_at)} · prioridade {reminder.priority}</p>
                    </div>
                    {/*
                      EMOJI SÓ NO PRAZO ESTOURADO. A lista é mista — vencidas e
                      próximas lado a lado — e a diferença entre as duas era
                      apenas a palavra e o tom. O ⏰ marca a única que já custou
                      alguma coisa; "PRÓXIMA" não ganha marca nenhuma, porque se
                      as duas tivessem, nenhuma informaria.
                      `aria-hidden`: a palavra "Vencida" está ao lado.
                    */}
                    {vencida
                      ? <StatusBadge tone="danger"><span aria-hidden="true">⏰</span> Vencida</StatusBadge>
                      : <StatusBadge tone="warning">Próxima</StatusBadge>}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {task?.lead_id
                      ? <Link href={`/leads/${task.lead_id}`} className={`atlas-button-primary min-h-11 ${focusRing}`}>Abrir lead</Link>
                      : <Link href="/tasks" className={`atlas-button-primary min-h-11 ${focusRing}`}>Abrir tarefa</Link>}
                    {!reminder.read_at ? <button type="button" onClick={() => void act(reminder.id, "read")} className={`cc6-ghost-btn ${focusRing}`}>Marcar como lido</button> : null}
                    <button type="button" onClick={() => void act(reminder.id, "dismiss")} className={`cc6-ghost-btn ${focusRing}`}>Dispensar</button>
                  </div>
                </article>
              );
            })
          ) : (
            /* O estado vazio volta ao COMPONENTE compartilhado. O passe de
                 experiência o reescreveu à mão e o texto para o usuário ficou
                 igual — o que se perdeu foi o CONTRATO: `AtlasEmpty` emite
                 `data-empty-reason` e `data-has-action`, que é o que permite
                 responder "esta tela está vazia por quê?" sem abrir o código.
                 Caixa escrita à mão diz a frase e não diz o motivo. */
              <AtlasEmpty
                reason="completed"
                title="Nenhum lembrete pendente"
                description="Sua operação está dentro das janelas configuradas."
              />
          )}
        </div>
      </section>

      <p className="max-w-[92ch] text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
        Realtime respeita RLS e filtra o próprio responsável. Nenhum cliente é contatado e nenhuma tarefa é concluída automaticamente.
      </p>
    </div>
  );
}
