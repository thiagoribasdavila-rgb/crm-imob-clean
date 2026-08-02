"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { LoadingState } from "@/components/atlas/loading-state";
import { ErrorState } from "@/components/atlas/error-state";
import { EmptyState } from "@/components/atlas/empty-state";
import { StatusBadge } from "@/components/atlas/status-badge";

type Category = "all" | "change" | "contact" | "transfer" | "ai" | "proposal" | "external";
type Event = { id: string; category: Exclude<Category, "all">; title: string; description: string | null; occurredAt: string; actorName: string; source: string; status?: string | null };
type Payload = { lead: { id: string; name: string | null }; events: Event[]; counts: Record<Exclude<Category, "all">, number> };
const filters: Array<{ value: Category; label: string }> = [{ value: "all", label: "Tudo" }, { value: "contact", label: "Contatos" }, { value: "change", label: "Mudanças" }, { value: "transfer", label: "Transferências" }, { value: "ai", label: "IA" }, { value: "proposal", label: "Propostas" }, { value: "external", label: "Externos" }];
const categoryLabel: Record<Event["category"], string> = { change: "CRM", contact: "Contato", transfer: "Transferência", ai: "IA", proposal: "Proposta", external: "Integração" };
const categoryTone: Record<Event["category"], "info" | "success" | "warning" | "violet"> = { change: "info", contact: "success", transfer: "warning", ai: "violet", proposal: "violet", external: "info" };

/* ── AQUI O EMOJI ENTRA, E O MOTIVO É MENSURÁVEL ────────────────────────────
   Esta é a única timeline MISTA do produto: seis origens diferentes empilhadas
   numa coluna só, lidas em varredura vertical. E `categoryTone` logo acima tem
   SEIS categorias mapeadas para QUATRO tons — `ai` e `proposal` saem as duas em
   violeta, `change` e `external` as duas em info. Para esses dois pares a cor
   não separa nada: só a palavra dentro da etiqueta separa, e palavra é o canal
   que a varredura justamente não lê.

   O emoji entra como SEGUNDO canal de TIPO, não como enfeite: forma
   reconhecível de relance, sobrevive em escala de cinza e distingue `ai` de
   `proposal` sem depender de ler "IA" e "PROPOSTA".

   `aria-hidden` em todos: o rótulo da categoria está do lado, na mesma
   etiqueta. Quem usa leitor de tela deve ouvir "PROPOSTA", não "página em
   branco PROPOSTA".

   Onde ele NÃO entrou, de propósito: na barra de filtros abaixo. Lá os sete
   botões já se separam por posição fixa e por contagem própria, e uma fileira
   de controles com um emoji em cada um é exatamente o marcador decorativo de
   seção que este produto recusa. ── */
const categoryMark: Record<Event["category"], string> = {
  contact: "💬",
  change: "✏️",
  transfer: "🤝",
  ai: "🤖",
  proposal: "📄",
  external: "🔌",
};

/* O mesmo vocabulário de segmento da lista de leads (app/(crm)/leads/page.tsx):
   acento vivo por `--atlas-accent` com alfa por `color-mix`, nunca hex
   concatenado. Reescrito aqui e não importado porque é receita de apresentação
   local — o que não pode divergir é o TOKEN, e ele é o mesmo. */
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";
const segmentoBase = "shrink-0 rounded-xl border font-medium transition-colors";
const segmentoAtivo =
  "border-[color-mix(in_srgb,var(--atlas-accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--atlas-accent)_10%,transparent)] text-[var(--atlas-texto-forte)]";
const segmentoInativo =
  "border-[var(--atlas-border)] bg-[color-mix(in_srgb,var(--atlas-texto-fraco)_6%,transparent)] text-[var(--atlas-texto-medio)] hover:border-[var(--atlas-border-strong)] hover:text-[var(--atlas-texto-forte)]";

export default function LeadTimeline({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Payload | null>(null);
  const [category, setCategory] = useState<Category>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session?.access_token) throw new Error("Sessão expirada. Entre novamente.");
        const response = await fetch(`/api/v1/leads/${id}/timeline`, { headers: { Authorization: `Bearer ${session.session.access_token}` }, signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Não foi possível carregar a timeline.");
        setData(payload);
      } catch (loadError) { if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Falha ao carregar histórico."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [id]);

  const events = useMemo(() => data?.events.filter((event) => category === "all" || event.category === category) ?? [], [category, data]);
  if (loading) return <LoadingState rows={6} />;
  if (error) return <ErrorState title="Timeline indisponível" description={error} action={<Link className="atlas-button-secondary" href={`/leads/${id}`}>Voltar à lead</Link>} />;

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-12" data-phase="29-unified-timeline">
      {/* ── O CABEÇALHO ERA UMA CAIXA SEM FUNDO ──────────────────────────────
          O fundo composto que morava aqui (um gradiente radial seguido de uma
          cor opaca, os dois dentro da MESMA utilidade de fundo do Tailwind) não
          pintava — mas o motivo não é o que parece, e vale registrar certo.

          Cuidado ao editar este bloco: o scanner do Tailwind lê comentário como
          lê JSX. Escrever aqui qualquer coisa com a forma de uma classe faz o
          build emitir uma regra morta no CSS de produção. Por isso o que segue
          descreve as utilidades por extenso, sem reproduzir a sintaxe delas.

          O Tailwind GERA a classe. Ela está no CSS compilado que o servidor
          entrega. O que ele emite é `background-color: <gradiente>, <cor>` —
          e `background-color` aceita UMA cor, nunca uma lista com gradiente.
          Declaração inválida é descartada na análise, então o navegador ficava
          com `background-color: transparent` e `background-image: none`: uma
          borda de 28px de raio em volta de nada, nos dois temas.

          A armadilha, então, não é "a classe não existe": é que a classe existe
          e emite CSS inválido. Conferir isso por `grep` do valor no bundle NÃO
          funciona — o Tailwind ESCAPA a vírgula no seletor, então procurar pelo
          valor cru não acha o que está lá. Só o valor COMPUTADO no navegador
          responde. (O tracking negativo que saiu do h1, por contraste, compila
          e pintava normalmente: saiu por decisão de escala tipográfica, não por
          estar morto — ver o degrau escolhido logo abaixo.)

          Some o raio de 28px junto: era o QUARTO raio de uma tela que já tinha
          16 (painel), 12 (cartão) e 999 (chip). Uma família por superfície.

          Nenhuma frase saiu — identidade, título, subtítulo e o link de volta
          continuam os quatro, com as mesmas palavras. ── */}
      <section className="cc6-panel cc6-reveal p-5 sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone="info">LEAD 360</StatusBadge>
              <StatusBadge tone="success">HISTÓRICO ÚNICO</StatusBadge>
            </div>
            {/* 30px (`text-3xl`) estava fora dos quatro degraus. Esta tela é
                AUDITORIA — ela conta o que já aconteceu, não pede decisão —,
                então fica no degrau de destaque (20px), abaixo do título da
                fila de leads, que é onde se decide. */}
            <h1 className="mt-4 text-numero font-semibold leading-tight text-[var(--atlas-texto-forte)]">
              Timeline de {data?.lead.name || "cliente"}
            </h1>
            {/* `text-slate-400` MEDIDO passava (4,95 claro · 7,54 escuro): o
                tema claro tem override para slate-200..500. A troca aqui é de
                vocabulário, não de resgate — o token diz o PAPEL do texto e não
                depende de uma lista de exceções em globals.css continuar
                cobrindo justamente este tom. O irmão `text-slate-600`, três
                linhas abaixo no cartão, é a prova de que a lista envelhece:
                600 está FORA dela e media 2,51 no escuro. */}
            <p className="mt-2 max-w-2xl text-corpo leading-5 text-[var(--atlas-texto-medio)]">
              Entenda o que aconteceu, quem agiu e de onde veio cada sinal — sem
              procurar em várias telas.
            </p>
          </div>
          <Link href={`/leads/${id}`} className="atlas-button-secondary min-h-11 shrink-0">
            ← Voltar ao Lead 360
          </Link>
        </div>
      </section>

      {/* ── O FILTRO ATIVO ERA INVISÍVEL NO TEMA CLARO ───────────────────────
          MEDIDO, o pior número desta tela: o botão selecionado usava
          `text-sky-100` sobre `bg-sky-400/10` — quase-branco sobre uma lavagem
          de azul clarinho. Contraste **1,01:1** no claro (15,18 no escuro, onde
          a receita foi desenhada). Ou seja: quem trabalha no tema claro não via
          QUAL recorte estava aplicado — e a tela inteira existe para recortar.
          Vocabulário de segmento por token, que vira nos dois temas.

          E o degrau de 11px vai no <span> de DENTRO, nunca no <button>:
          globals.css declara `button,input,select,textarea { font: inherit }`
          fora de camada, e regra sem camada vence `@layer utilities`. Medido
          antes de mexer: estes botões diziam `text-xs` no fonte e renderizavam
          em 16px. Junto veio o piso de toque — eram 42px, o mínimo é 44. ── */}
      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar eventos da timeline">
        {filters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setCategory(filter.value)}
            aria-pressed={category === filter.value}
            className={`${segmentoBase} ${category === filter.value ? segmentoAtivo : segmentoInativo} flex min-h-11 items-center gap-2 px-3 ${focusRing}`}
          >
            <span className="text-rotulo">{filter.label}</span>
            {/* O `!` não é capricho: globals.css tem
                `:root[data-theme="light"] .cc6-num:not(.atlas-leads-table-panel *)`
                pintando TODO número de âmbar fora da tabela de leads — (0,3,0)
                contra (0,1,0) do utilitário. Sem forçar, a contagem de
                "Externos · 1" saía na cor de ATENÇÃO, dizendo que há algo
                errado com um inventário que só conta linhas. */}
            <span className="cc6-num text-rotulo text-[var(--atlas-texto-fraco)]!">
              {filter.value === "all" ? data?.events.length || 0 : data?.counts[filter.value] || 0}
            </span>
          </button>
        ))}
      </nav>

      {!events.length ? (
        <EmptyState
          title="Nenhum evento nesta categoria"
          description="Quando a equipe ou as integrações registrarem uma ação, ela aparecerá aqui automaticamente."
        />
      ) : (
        /* A espinha era `bg-white/[.08]`. O tema claro converte
           `[class*="bg-white/"]` no ELEMENTO, mas não alcança o `::before` —
           então no claro a linha que liga os eventos simplesmente não existia.
           Token: mesma linha, nos dois temas.

           E ela NÃO PASSAVA PELOS PONTOS. Medido no navegador: centro da linha
           em 19,5px, centro dos marcadores em 16,5px — 3px de desencontro em
           toda a coluna. Uma linha que erra o alvo que deveria costurar é
           ruído, não estrutura. 19 → 16 alinha exatamente
           (40 de `ml-10` − 30 de deslocamento + 5,5 de meio-ponto). */
        <section className="relative space-y-2 before:absolute before:bottom-4 before:left-[16px] before:top-4 before:w-px before:bg-[var(--atlas-border)]">
          {events.map((event) => (
            <article key={event.id} className="cc6-panel-quiet relative ml-10 p-4 sm:p-5">
              {/* O marcador era `bg-sky-300` com anel `border-slate-950` e um
                  halo em rgba cravado: três cores fixas que não viram com o
                  tema — no claro, um anel quase preto em volta de um azul que
                  não é o acento do produto. Acento vivo + a cor da superfície
                  como anel. */}
              <span
                className="absolute -left-[30px] top-5 h-[11px] w-[11px] rounded-full border-2 border-[var(--atlas-surface)] bg-[var(--atlas-accent)]"
                aria-hidden="true"
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={categoryTone[event.category]}>
                      {/* 13px contra os 10px do rótulo: a etiqueta força
                          `text-micro`, e um emoji de 10px não é canal — some na
                          varredura, que é justamente o que ele veio resolver.
                          `leading-none` mantém a altura da etiqueta. */}
                      <span aria-hidden="true" className="text-corpo leading-none">
                        {categoryMark[event.category]}
                      </span>
                      {categoryLabel[event.category]}
                    </StatusBadge>
                    {event.status ? (
                      <span className="text-micro uppercase tracking-wider text-[var(--atlas-texto-fraco)]">
                        {event.status}
                      </span>
                    ) : null}
                  </div>
                  <h2 className="mt-3 text-corpo font-semibold leading-5 text-[var(--atlas-texto-forte)]">
                    {event.title}
                  </h2>
                  {event.description ? (
                    <p className="mt-1 text-corpo leading-5 text-[var(--atlas-texto-medio)]">
                      {event.description}
                    </p>
                  ) : null}
                  {/* Quem agiu e por qual caminho: era `text-slate-600`, e o
                      tema claro de globals.css só cobre slate-200..500 — 600
                      ficou de fora. MEDIDO no ESCURO: 2,51:1. A autoria de cada
                      evento, que é o que responde "quem fez isso", estava
                      ilegível justamente no tema padrão do produto. */}
                  <p className="mt-3 text-micro text-[var(--atlas-texto-fraco)]">
                    {event.actorName} · {event.source.replaceAll("_", " ")}
                  </p>
                </div>
                {/* SEM `cc6-num`, e é medida: no tema claro a regra
                    `.cc6-num:not(.atlas-leads-table-panel *)` de globals.css
                    pinta o elemento inteiro com a tinta de ATENÇÃO e ganha do
                    utilitário de cor. A data saía em 4,36 sobre o cartão —
                    abaixo do piso de 4,5 — e ainda por cima na cor de ATENÇÃO,
                    como se toda linha do histórico fosse um alerta. Data não é
                    número que se compara entre cartões: não precisa de tabular,
                    precisa de contraste. */}
                <time
                  className="shrink-0 text-rotulo text-[var(--atlas-texto-medio)]"
                  dateTime={event.occurredAt}
                >
                  {new Date(event.occurredAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </time>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
