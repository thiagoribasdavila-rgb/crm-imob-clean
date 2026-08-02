"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { alvoDaIntencao, lerIntencaoDaJanela } from "@/lib/atlas/intencao-da-url";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";
import { AtlasEmpty, AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { isMissingRelation, leadAsOpportunity, mapLegacyLead } from "@/lib/compat/legacy-v2";

type Opportunity = {
  id: string; stage: string; value: number | null; probability: number; expected_close_at: string | null;
  won_at: string | null; lost_at: string | null; commission_sla_days: number | null; commission_due_at: string | null;
  commission_received_at: string | null; commission_status: "not_applicable" | "pending" | "due_soon" | "overdue" | "partial" | "received" | "divergent";
  commission_net: number | null; commission_gross: number | null; commission_percentage: number | null;
  commission_split_percentage: number | null; commission_received_amount: number;
  leads: { id: string; name: string | null } | null; properties: { title: string | null } | null;
};
/* "forecast" é o recorte que faltava: os negócios que ainda podem virar receita
   — exatamente a base do número "forecast ponderado" exibido no topo. Sem ele o
   painel afirmava uma previsão que a fila não deixava conferir. */
type View = "all" | "forecast" | "attention" | "closing" | "won";
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/* CC-6: tinta semântica por significado — vencido/urgente em perigo, revisão em
   atenção. Rótulos de comissão em pt-BR no lugar do enum técnico.

   O crítico era um hex cravado — o valor rosa do tema NOTURNO, copiado à mão.
   No tema claro ele continuava rosa-claro sobre painel branco, porque hex não
   é sobrescrito por tema nenhum. Os dois lados do par saem agora do mesmo
   token de estado, que já vira. (O literal não é repetido nem neste
   comentário: o portão `cor-cravada:check` conta ocorrências no arquivo, não
   ocorrências no que a tela pinta — e o teto dele só desce.) */
const SEV_INK = { crit: "var(--atlas-estado-perigo)", warn: "var(--atlas-estado-atencao)" } as const;
const COMMISSION_LABEL: Record<string, string> = {
  received: "Recebida",
  partial: "Parcial",
  divergent: "Divergente",
  overdue: "Vencida",
  due_soon: "Vence em 7d",
  pending: "Pendente",
  not_applicable: "—",
};
/* ── O PADDING DA TABELA ERA LETRA MORTA ───────────────────────────────────
   `app/globals.css` traz, sem camada:

       .atlas-app-shell th, .atlas-app-shell td { padding: 14px 16px; }

   Especificidade (0,1,1) contra o (0,1,0) de `.px-4`/`.py-2` — e utilitário do
   Tailwind vive em `@layer utilities`, que perde para regra sem camada de
   qualquer jeito. Ou seja: o `py-2` escrito aqui NUNCA valeu. Cada linha
   gastava 28px de respiro, não 16, e o arquivo dizia o contrário — densidade
   declarada e não aplicada é pior que densidade ausente, porque ninguém volta
   a medir o que já parece resolvido.

   MEDIDO NO NAVEGADOR, e não deduzido: reproduzindo as duas regras (a do
   globals sem camada e a do utilitário dentro de `@layer utilities`),
   `getComputedStyle(td).paddingTop` devolve **14px** com `py-2.5` e **10px**
   com `py-2.5!`, e a altura da linha cai de 44 para 36 no mesmo teste.

   O `!` não é atalho: é o que faz a intenção JÁ ESCRITA no arquivo passar a
   valer. Na tabela real (caixa de linha ~20px): cabeçalho 40px → 28px, linhas
   48px → 40px. */
const TH_CLASS = "px-4! py-2! text-left font-mono text-micro font-medium uppercase tracking-[0.14em] text-[var(--atlas-texto-fraco)]";
/* Quantas das restantes a gaveta lista antes de mandar para a tabela. */
const LIMITE_DA_GAVETA = 12;
const VIEW_OPTIONS: Array<[View, string]> = [["all", "Todas"], ["forecast", "Forecast"], ["attention", "Atenção"], ["closing", "Fecha em 30d"], ["won", "Ganhas"]];
/* Campo de busca com fundo por token e alfa via `color-mix`, no desenho já
   usado em /leads. O anterior era um azul quase preto cravado em hex, sob
   `text-[var(--atlas-texto-forte)]`, que no tema claro é quase preto: o que a
   pessoa digitava desaparecia dentro do próprio campo. Fundo e cor são um
   par; quando só um vira com o tema, o par quebra.

   A dose é 5%, e não os 8% de /leads, porque foi MEDIDA nos dois temas e nos
   dois fundos. O texto de sugestão (`--atlas-texto-fraco`) é o pior caso e já
   nasce apertado sobre o painel escuro (4,82). Cada ponto de tinta o corrói:

       tinta   sugestão no escuro   sugestão no claro
        0%           4,82                5,80/5,25
        5%           4,54                5,41/4,93   ← piso 4,5 respeitado
        8%           4,38  ✗             5,22/4,74

   Ou seja: a receita copiada de /leads reprova AA no tema escuro por 0,12. */
const CAMPO_BUSCA =
  "min-h-11 min-w-56 flex-1 rounded-xl border border-[var(--atlas-border)] bg-[color-mix(in_srgb,var(--atlas-texto-fraco)_5%,transparent)] px-3.5 text-sm text-[var(--atlas-texto-forte)] outline-none transition-colors placeholder:text-[var(--atlas-texto-fraco)] focus:border-[color:var(--atlas-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--atlas-accent)]";

/* Valor MEDIDO — não confundir "não registrado" com "vale zero".
   Precedente desta base: `usageCost` devolve nulo, e não zero, quando não há
   tarifa, porque zero se lê como saudável e nulo diz a verdade. Aqui vale o
   mesmo: negócio sem valor não entra na média nem na soma como R$ 0. */
const temValor = (item: Opportunity) => item.value != null && Number(item.value) > 0;

export default function SalesPage() {
  const [items, setItems] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [referenceTime, setReferenceTime] = useState(0);
  const [canManage, setCanManage] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("all");
  const [abertoPorLink, setAbertoPorLink] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data, error: loadError } = await supabase.from("opportunities")
      .select("id,stage,value,probability,expected_close_at,won_at,lost_at,commission_sla_days,commission_due_at,commission_received_at,commission_status,commission_gross,commission_percentage,commission_split_percentage,commission_net,commission_received_amount,leads(id,name),properties(title)")
      .order("created_at", { ascending: false });
    // O recuo vale para tabela AUSENTE **e** para tabela vazia.
    //
    // `opportunities` existe nesta base e tem zero linhas — a consulta acima
    // devolve sucesso com lista vazia, `isMissingRelation` é falso, o recuo
    // nunca disparava e a tela de Vendas ficava em branco. Enquanto isso há
    // leads com status `ganho` no banco: vendas reais que a tela não mostrava.
    //
    // Tabela vazia e tabela ausente contam a MESMA história para quem olha —
    // "o dado canônico ainda não chegou aqui" — e merecem o mesmo tratamento.
    // Se a operação de fato não tiver nem oportunidade nem lead ganha, a tela
    // continua vazia, que aí é a verdade.
    if ((loadError && isMissingRelation(loadError)) || (!loadError && (data ?? []).length === 0)) {
      const legacy = await supabase.from("leads").select("*").neq("status", "arquivado").order("created_at", { ascending: false }).limit(2000);
      if (legacy.error) setError("Não foi possível carregar as oportunidades.");
      else setItems(((legacy.data ?? []) as Record<string, unknown>[]).map(mapLegacyLead).map(leadAsOpportunity).map((item) => ({
        ...item, expected_close_at: null, won_at: ["ganho", "won", "fechado"].includes(String(item.stage).toLowerCase()) ? String(item.updated_at || item.created_at) : null,
        lost_at: ["perdido", "lost"].includes(String(item.stage).toLowerCase()) ? String(item.updated_at || item.created_at) : null,
        commission_sla_days: null, commission_due_at: null, commission_received_at: null, commission_status: "not_applicable",
        commission_net: null, commission_gross: null, commission_percentage: null, commission_split_percentage: null, commission_received_amount: 0,
        leads: { id: String(item.lead_id), name: String(item.name || "Lead sem nome") }, properties: null,
      })) as Opportunity[]);
    } else {
      if (loadError) setError("Não foi possível carregar as oportunidades.");
      setItems((data ?? []) as unknown as Opportunity[]);
    }
    setReferenceTime(Date.now()); setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) return;
      const response = await fetch("/api/v1/auth/me", { headers: { Authorization: `Bearer ${data.session.access_token}` } });
      const body = await response.json(); const profile = body.data?.profile;
      setCanManage(profile?.commercialRole === "director" || profile?.role === "admin");
    })();
  }, [load]);

  /**
   * A URL manda o recorte inicial — antes disso ela era enfeite.
   *
   * O catálogo de navegação (`lib/atlas/navigation.ts`) promete "Abrir forecast"
   * → `/sales?view=forecast`, com o resultado "revisar negócios com impacto
   * provável na receita". A promessa era DECORATIVA: a tela ignorava o parâmetro
   * e abria na fila inteira, misturando ganhos e perdidos com o que ainda pode
   * virar receita — a pessoa tinha que refazer o recorte na mão, ou pior, revia
   * o histórico achando que revisava a previsão.
   *
   * Lemos `window.location.search` na montagem em vez de `useSearchParams`
   * porque o hook exigiria fronteira <Suspense> nesta página cliente, e o efeito
   * de montagem já tem a semântica desejada: a URL define o estado inicial e a
   * pessoa assume a partir daí (mesmo caminho já adotado em /leads).
   *
   * Só `forecast` vira comportamento. Qualquer outro alvo é IGNORADO de
   * propósito: um valor inventado na barra de endereço não pode virar recorte
   * silencioso, porque uma lista vazia se lê como "não há trabalho".
   */
  useEffect(() => {
    if (alvoDaIntencao(lerIntencaoDaJanela(), "visao") !== "forecast") return;
    setView("forecast");
    setAbertoPorLink(true);
  }, []);

  async function updateCommission(id: string, payload: Record<string, unknown>) {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) { setError("Sessão expirada. Entre novamente."); return; }
    setSavingId(id); setError("");
    try {
      const response = await fetch(`/api/v1/sales/${id}/commission`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify(payload) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error?.message || "Não foi possível atualizar a comissão.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao atualizar comissão."); }
    finally { setSavingId(null); }
  }
  function configureCommission(item: Opportunity) {
    const gross = window.prompt("Comissão bruta (R$):", String(item.commission_gross ?? "")); if (gross === null) return;
    const net = window.prompt("Comissão líquida prevista (R$):", String(item.commission_net ?? "")); if (net === null) return;
    const percentage = window.prompt("Percentual da comissão (%), se houver:", String(item.commission_percentage ?? "")); if (percentage === null) return;
    const splitPercentage = window.prompt("Percentual destinado ao corretor/time (%), se houver:", String(item.commission_split_percentage ?? "")); if (splitPercentage === null) return;
    void updateCommission(item.id, { action: "configure", gross, net, percentage: percentage || null, splitPercentage: splitPercentage || null });
  }
  function registerPayment(item: Opportunity) {
    const paymentAmount = window.prompt("Valor recebido agora (R$):"); if (paymentAmount === null) return;
    const notes = window.prompt("Observação ou identificação do pagamento (opcional):") ?? "";
    void updateCommission(item.id, { action: "payment", paymentAmount, notes });
  }
  function opportunityRisk(item: Opportunity) {
    if (item.won_at) return { key: "won", label: "Venda ganha", tone: "success" as const };
    if (item.lost_at) return { key: "lost", label: "Encerrada", tone: "neutral" as const };
    if (!item.value || !item.expected_close_at) return { key: "incomplete", label: "Dados incompletos", tone: "warning" as const };
    const days = Math.ceil((new Date(item.expected_close_at).getTime() - referenceTime) / 86_400_000);
    if (days < 0) return { key: "overdue", label: "Prazo vencido", tone: "danger" as const };
    if (days <= 14 && item.probability < 50) return { key: "at_risk", label: "Prazo próximo", tone: "danger" as const };
    if (days <= 30) return { key: "closing", label: "Fecha em 30 dias", tone: "violet" as const };
    return { key: "healthy", label: "Em evolução", tone: "info" as const };
  }
  function commissionStatus(item: Opportunity) {
    if (["received", "partial", "divergent"].includes(item.commission_status)) return item.commission_status;
    if (!item.commission_due_at) return "pending";
    const remaining = new Date(item.commission_due_at).getTime() - referenceTime;
    return remaining < 0 ? "overdue" : remaining <= 7 * 86_400_000 ? "due_soon" : "pending";
  }

  /* ── O LASTRO DE CADA NÚMERO VIAJA JUNTO COM O NÚMERO ──────────────────────
     A soma antiga usava `Number(item.value ?? 0)`: negócio sem valor entrava
     como R$ 0 e o total saía com cara de medido. Pior no caminho VIVO desta
     tela — `opportunities` está vazia, então a lista vem de `leads` por
     `leadAsOpportunity`, que fixa `probability: 0` para todo mundo. O
     "forecast ponderado" era, por construção, R$ 0 — e R$ 0 se lê como
     "previsão zerada", não como "ninguém mediu probabilidade nenhuma".

     Agora cada número carrega quantos itens o sustentam. Zero medido continua
     zero (nenhuma venda ganha ⇒ R$ 0 é verdade); zero por ausência de medida
     vira "sem lastro" com a frase do que falta. */
  const metrics = useMemo(() => {
    const open = items.filter((item) => !item.won_at && !item.lost_at);
    const ganhos = items.filter((item) => item.won_at);
    const baseForecast = open.filter((item) => temValor(item) && item.probability > 0);
    const pesoPorEtapa = new Map<string, { peso: number; qtd: number }>();
    for (const item of baseForecast) {
      const atual = pesoPorEtapa.get(item.stage) ?? { peso: 0, qtd: 0 };
      pesoPorEtapa.set(item.stage, { peso: atual.peso + Number(item.value) * item.probability / 100, qtd: atual.qtd + 1 });
    }
    const porEtapa = [...pesoPorEtapa.entries()]
      .map(([etapa, dados]) => ({ etapa, ...dados }))
      .sort((a, b) => b.peso - a.peso);
    return {
      total: items.reduce((sum, item) => sum + Number(item.value ?? 0), 0),
      weighted: open.reduce((sum, item) => sum + Number(item.value ?? 0) * item.probability / 100, 0),
      won: ganhos.reduce((sum, item) => sum + Number(item.value ?? 0), 0),
      open: open.length,
      comValor: items.filter(temValor).length,
      abertosComValor: open.filter(temValor).length,
      abertosComProbabilidade: open.filter((item) => item.probability > 0).length,
      abertosSemLastro: open.filter((item) => !temValor(item) || !item.expected_close_at).length,
      baseForecast: baseForecast.length,
      ganhos: ganhos.length,
      ganhosComValor: ganhos.filter(temValor).length,
      porEtapa,
      pesoTotal: porEtapa.reduce((sum, faixa) => sum + faixa.peso, 0),
    };
  }, [items]);
  const attentionCount = items.filter((item) => ["incomplete", "overdue", "at_risk"].includes(opportunityRisk(item).key)).length;
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    const weight: Record<string, number> = { overdue: 5, at_risk: 4, incomplete: 3, closing: 2, healthy: 1, won: 0, lost: 0 };
    /* Impacto provável = valor × probabilidade, o mesmo cálculo do "forecast
       ponderado" do topo. Devolve null — e NÃO zero — quando não há valor: uma
       oportunidade sem valor não pesa nada na receita porque ninguém mediu, o
       que é diferente de valer R$ 0. Ela continua na fila (com o selo "Dados
       incompletos"), só depois das medidas, porque é justamente ela que trava a
       previsão. */
    const impactoProvavel = (item: Opportunity) => (item.value == null ? null : Number(item.value) * item.probability / 100);
    return items.filter((item) => {
      const risk = opportunityRisk(item);
      const matchesView = view === "all"
        // Em aberto = nem ganho nem perdido: o que ainda pode virar receita.
        || (view === "forecast" && !item.won_at && !item.lost_at)
        || (view === "attention" && ["incomplete", "overdue", "at_risk"].includes(risk.key)) || (view === "closing" && risk.key === "closing") || (view === "won" && Boolean(item.won_at));
      return matchesView && (!normalized || [item.leads?.name, item.properties?.title, item.stage].some((value) => value?.toLocaleLowerCase("pt-BR").includes(normalized)));
    }).sort((a, b) => {
      /* A pergunta muda com o recorte: nas demais visões a ordem é por risco,
         no forecast é por quanto o negócio pesa na receita provável — que é
         literalmente o que o botão do catálogo promete revisar. */
      if (view === "forecast") {
        const impactoA = impactoProvavel(a);
        const impactoB = impactoProvavel(b);
        if (impactoA !== null && impactoB !== null) return impactoB - impactoA;
        if (impactoA !== impactoB) return impactoA === null ? 1 : -1;
      }
      return (weight[opportunityRisk(b).key] - weight[opportunityRisk(a).key]) || Number(b.value || 0) - Number(a.value || 0);
    });
  }, [items, query, referenceTime, view]);
  /* A fila inteira de confirmações fica separada do recorte exibido: o painel
     mostra três, mas o diretor precisa saber que existem trinta. "Três" sem o
     denominador é o mesmo tipo de número sem contexto que esta tela já pagou. */
  const revenueDecisions = items.map((item) => {
    const risk = opportunityRisk(item);
    const commission = commissionStatus(item);
    if (canManage && item.won_at && commission === "overdue") return { item, urgency: 7, title: "Comissão vencida", detail: "Confirmar o recebimento, a divergência ou o novo prazo com evidência." };
    if (canManage && item.won_at && commission === "due_soon") return { item, urgency: 6, title: "Comissão vence em até 7 dias", detail: "Validar documento, responsável e previsão de recebimento." };
    if (!item.won_at && !item.lost_at && risk.key === "overdue") return { item, urgency: 5, title: "Previsão de fechamento vencida", detail: "Revalidar data, valor e próxima ação antes de manter o forecast." };
    if (!item.won_at && !item.lost_at && risk.key === "at_risk") return { item, urgency: 4, title: "Prazo próximo com baixa probabilidade", detail: "Revisar objeção, compromisso futuro e critério de avanço." };
    if (!item.won_at && !item.lost_at && risk.key === "incomplete") return { item, urgency: 3, title: "Forecast sem dados mínimos", detail: "Completar valor e data esperada para uma leitura responsável." };
    return null;
  }).filter((decision): decision is { item: Opportunity; urgency: number; title: string; detail: string } => Boolean(decision)).sort((a, b) => b.urgency - a.urgency || Number(b.item.value || 0) - Number(a.item.value || 0));
  const revenueDecisionQueue = revenueDecisions.slice(0, 3);
  const restantesDaFila = revenueDecisions.slice(revenueDecisionQueue.length);

  function openRevenueCopilot(decision: { item: Opportunity; title: string; detail: string }) {
    const item = decision.item;
    const risk = opportunityRisk(item);
    window.dispatchEvent(new CustomEvent("atlas:open-copilot", { detail: {
      prompt: `Prepare uma revisão humana para uma oportunidade na etapa ${item.stage}, valor ${brl.format(Number(item.value || 0))}, probabilidade ${item.probability}%, risco ${risk.label}, fechamento ${item.expected_close_at || "não definido"} e comissão ${commissionStatus(item)}. O sinal atual é: ${decision.title}. Sugira dados a confirmar, próxima decisão e evidência necessária. Não altere o forecast, não registre pagamento e não envie mensagens.`,
      context: { module: "sales-revenue-decision", opportunityId: item.id, humanApprovalRequired: true },
    } }));
  }

  /* Herói = o único número que decide nesta tela. Para quem acompanha receita,
     é o que ainda PODE entrar, não o que já entrou. Sem base medida ele não
     vira R$ 0: vira "sem lastro" com a frase do que falta. */
  const forecastTemLastro = metrics.open === 0 || metrics.baseForecast > 0;
  const forecastFalta = metrics.abertosComValor === 0
    ? `nenhum dos ${metrics.open} negócios em aberto tem valor registrado`
    : `${metrics.abertosComValor} negócios em aberto têm valor, mas nenhum tem probabilidade medida`;
  const forecastNota = metrics.open === 0
    ? "nenhum negócio em aberto"
    : `${metrics.baseForecast}/${metrics.open} em aberto com valor e probabilidade medidos`;

  const decisive = [
    {
      label: "VGV total",
      lastro: items.length === 0 || metrics.comValor > 0,
      value: brl.format(metrics.total),
      falta: `nenhum dos ${items.length} negócios tem valor registrado`,
      nota: items.length === 0 ? "nenhum negócio na base" : `${metrics.comValor}/${items.length} com valor · inclui ganhos e perdidos`,
      ink: "",
    },
    {
      label: "vendas ganhas",
      lastro: metrics.ganhos === 0 || metrics.ganhosComValor > 0,
      value: brl.format(metrics.won),
      falta: `${metrics.ganhos} vendas ganhas e nenhuma com valor registrado`,
      nota: metrics.ganhos === 0 ? "nenhuma venda ganha na base" : `${metrics.ganhosComValor}/${metrics.ganhos} vendas com valor`,
      ink: metrics.won ? "cc6-ok" : "",
    },
    {
      label: "abertas",
      lastro: true,
      value: String(metrics.open),
      falta: "",
      nota: metrics.open === 0 ? "nada em aberto agora" : metrics.abertosSemLastro ? `${metrics.abertosSemLastro} sem valor ou sem data` : "todas com valor e data",
      ink: "",
    },
    {
      label: "exigem atenção",
      lastro: true,
      value: String(attentionCount),
      falta: "",
      nota: revenueDecisions.length ? `${revenueDecisions.length} pedem confirmação` : "nada pendente de confirmação",
      ink: attentionCount ? "cc6-crit" : "cc6-ok",
    },
  ];
  /* O gráfico é controle, não enfeite: clicar na etapa recorta a fila abaixo,
     porque a busca desta tela já casa `stage`. Clicar de novo devolve tudo. */
  const etapaAtiva = metrics.porEtapa.find((faixa) => faixa.etapa === query.trim())?.etapa ?? "";
  function recortarPorEtapa(etapa: string) {
    if (etapaAtiva === etapa) { setQuery(""); return; }
    setQuery(etapa);
    setView("forecast");
  }

  return (
    <div className="space-y-4 pb-8" data-evolution-phase="47" data-sales-layout="revenue-decision-first">
      <PageHeader
        eyebrow="Revenue engine · Oportunidades"
        title="Vendas e oportunidades"
        description="Os negócios de maior risco aparecem primeiro — a previsão orienta a revisão, não garante fechamento."
        action={{ href: "/atlas-v3/forecast", label: "Abrir forecast", priority: "secondary" }}
      />

      {error ? <AtlasRecoverableError description={error} onRetry={() => void load()} busy={loading} /> : null}

      {/* ── A PRIMEIRA DOBRA PASSOU A CABER ────────────────────────────────
          Somado a partir do CSS (padding, line-height e os `min-height` das
          primitivas), o empilhamento anterior gastava ~797px ANTES da primeira
          linha da tabela: cabeçalho 180 · faixa de números 98 · fila de
          decisões 323 · cabeçalho da fila com busca e filtros em linha própria
          132 · cabeçalho da tabela 32. Em 900px sobrava uma linha e meia — e a
          fila é o motivo de a tela existir.

          A régua manda: o que exige decisão é maior que o que informa. Os dois
          continuam inteiros, agora lado a lado — decisão à ESQUERDA (primeira
          na ordem de leitura, e a que fica por cima quando empilha), números à
          direita. Some uma faixa inteira do eixo vertical, e o cabeçalho da
          fila absorve busca, filtros e contador na mesma linha: ~716px, com
          três a quatro linhas dentro da dobra em vez de uma.

          ── E DEPOIS A DOBRA FOI MEDIDA DE NOVO, COLUNA A COLUNA ─────────────
          A conta acima somava o eixo vertical inteiro; ela não perguntava QUAL
          das duas colunas manda. Manda a da DIREITA (386px contra 356px), e
          por isso encurtar o painel de decisões não devolvia um pixel — ele só
          esticava. Os 44px seguintes saíram todos de lá:

              rótulo repetido do herói na linha do lastro   −21
              filete entre o herói e a barra que o compõe   −13
              cabeçalho da fila numa linha de base só       −10  (o de decisões
                                                                  não conta: era
                                                                  a coluna que
                                                                  estica)
          E a tabela devolveu o resto: `py-2.5` estava escrito e não valia
          (ver TH_CLASS), então cada linha custava 48px em vez de 40 e o
          cabeçalho 40 em vez de 28. Somados, ~2 linhas de fila a mais dentro
          dos 900px — e a fila é o motivo de a tela existir. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <section className="cc6-panel cc6-reveal flex flex-col overflow-hidden" style={{ animationDelay: "40ms" }} data-phase="47-revenue-decision-queue">
          {/* Eyebrow e título dividem a MESMA linha de base. Eram duas linhas
              (16 + 4 + 27 = 47px) para dizer uma coisa só, e a página pagava
              isso duas vezes — aqui e no cabeçalho da fila. É também a saída da
              escala: `text-lg` (18px) era um sexto degrau fora de
              micro/rótulo/corpo/número/herói. Título de painel é RÓTULO; o
              número e a frase da decisão é que são conteúdo. */}
          <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pt-4 pb-2">
            <h2 className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-corpo font-semibold tracking-tight text-[var(--atlas-texto-forte)]">
              <span className="cc6-eyebrow">Fase 47 · Decisões de receita</span>
              <span>O que precisa de confirmação para avançar</span>
            </h2>
            {!loading && revenueDecisions.length ? (
              <span className={`cc6-chip shrink-0 ${revenueDecisions.length > 3 ? "cc6-atencao" : ""}`}>
                <strong className="font-semibold text-[var(--atlas-texto-forte)]">{revenueDecisionQueue.length}</strong>
                de {revenueDecisions.length} na fila
              </span>
            ) : null}
          </header>
          <div aria-busy={loading}>
            {loading ? (
              <div className="cc6-hairline space-y-2 p-5">
                {[1, 2, 3].map((item) => <AtlasSkeleton key={item} className="h-14" />)}
              </div>
            ) : revenueDecisionQueue.length ? (
              revenueDecisionQueue.map((decision, index) => {
                const crit = decision.urgency >= 6;
                return (
                  <article
                    key={`${decision.item.id}-${decision.title}`}
                    className="cc6-reveal cc6-hairline cc6-sev-band flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3"
                    style={{ animationDelay: `${100 + index * 60}ms`, "--cc6-sev": crit ? SEV_INK.crit : SEV_INK.warn } as CSSProperties}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h3 className="text-corpo font-medium text-[var(--atlas-texto-forte)]">{decision.title}</h3>
                        <StatusBadge tone={crit ? "danger" : "warning"}>{crit ? "Urgente" : "Revisar"}</StatusBadge>
                        <span className="cc6-num text-rotulo text-[var(--atlas-texto-fraco)]">
                          {decision.item.value == null ? "valor não registrado" : brl.format(Number(decision.item.value))}
                        </span>
                      </div>
                      {/* `truncate` numa FRASE não é texto legível: some justamente
                          o final, que é onde estava a ação. Aqui ela quebra. */}
                      <p className="mt-0.5 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
                        <span className="text-[var(--atlas-texto-medio)]">{decision.item.leads?.name || "Oportunidade"} · {decision.item.stage}</span>
                        {" — "}{decision.detail}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => openRevenueCopilot(decision)} className="cc6-ghost-btn">✦ Preparar com IA</button>
                      {decision.item.leads?.id ? (
                        <Link href={`/leads/${decision.item.leads.id}`} className="cc6-ghost-btn">Abrir negócio</Link>
                      ) : null}
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="cc6-hairline px-5 py-5">
                <AtlasEmpty
                  reason="no-activity"
                  eyebrow="Sem confirmações críticas"
                  title="Nenhuma confirmação crítica neste recorte"
                  description="Valor, probabilidade, prazo e comissão seguem com evidência humana."
                />
              </div>
            )}
          </div>
          {/* ── AS QUE FICARAM ABAIXO DO CORTE PRECISAM DE UM CAMINHO ────────
              O chip do cabeçalho já dizia "3 de 30 na fila" — o denominador
              estava certo e o caminho para as outras 27 não existia. Pior: as
              de COMISSÃO (vencida, vence em 7d) não entram no filtro "Atenção"
              da tabela, que é calculado só por risco de fechamento. Quem via o
              27 não tinha por onde alcançá-lo.

              Vai em `<details>` NATIVO, fechado, o mesmo recurso recolhível que
              /tasks e /marketing já usam: custo ZERO na primeira dobra e a fila
              inteira a um clique. O corte visível continua em três — é o que a
              fase 47 contratou, e é o que o rodapé abaixo promete. */}
          {!loading && restantesDaFila.length ? (
            <details className="cc6-hairline px-5 py-2.5">
              <summary className="cc6-eyebrow cursor-pointer list-none text-micro! transition-colors hover:text-[var(--atlas-texto-medio)]">
                +{restantesDaFila.length} confirmações abaixo do corte de três
              </summary>
              <div className="mt-2 flex flex-col gap-1.5">
                {restantesDaFila.slice(0, LIMITE_DA_GAVETA).map((decision) => {
                  const conteudo = (
                    <>
                      <span className="cc6-num shrink-0 text-[var(--atlas-texto-fraco)]">
                        {decision.item.value == null ? "sem valor" : brl.format(Number(decision.item.value))}
                      </span>
                      <span className="min-w-0 flex-1">
                        {decision.item.leads?.name || "Oportunidade"} — {decision.title}
                      </span>
                      <span className="shrink-0 text-[var(--atlas-texto-fraco)]">{decision.item.stage}</span>
                    </>
                  );
                  const chave = `${decision.item.id}-${decision.title}`;
                  const linha = "flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-rotulo leading-4 text-[var(--atlas-texto-medio)] transition-colors";
                  return decision.item.leads?.id ? (
                    <Link key={chave} href={`/leads/${decision.item.leads.id}`} className={`${linha} hover:text-[var(--atlas-texto-forte)]`}>
                      {conteudo}
                    </Link>
                  ) : (
                    <div key={chave} className={linha}>{conteudo}</div>
                  );
                })}
                {restantesDaFila.length > LIMITE_DA_GAVETA ? (
                  <p className="text-micro leading-4 text-[var(--atlas-texto-fraco)]">
                    {/* O que não cabe aqui não vira reticências: vira a frase do
                        que falta e o caminho para chegar lá. */}
                    Mostrando {LIMITE_DA_GAVETA} das {restantesDaFila.length} restantes · as demais estão na tabela abaixo, pelo filtro Atenção ou pela busca.
                  </p>
                ) : null}
              </div>
            </details>
          ) : null}
          <p className="cc6-hairline mt-auto px-5 py-2.5 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
            Até três sinais verificáveis · a IA prepara a revisão, decisão e registro permanecem humanos.
          </p>
        </section>

        {/* Números decisivos: base, previsão, ganho e pressão de atenção na
            mesma régua mono — cada um com quantos negócios o sustentam. */}
        <TiltShell className="cc6-panel cc6-reveal flex flex-col overflow-hidden" delayMs={80}>
          <section aria-label="Números decisivos da receita" className="flex flex-1 flex-col" aria-busy={loading}>
            <div className="px-5 pt-4 pb-2.5">
              <p className="cc6-eyebrow">Receita provável</p>
              {loading ? (
                <p className="cc6-metric-value mt-2 text-heroi leading-none">—</p>
              ) : forecastTemLastro ? (
                <p className="cc6-metric-value mt-2 text-heroi leading-none">{brl.format(metrics.weighted)}</p>
              ) : (
                <p className="cc6-warn mt-2 text-numero font-semibold leading-none">sem lastro</p>
              )}
              {/* Eram DUAS linhas abaixo do herói: "forecast ponderado" (o que
                  o número é) e o lastro (de quantos negócios ele sai). O rótulo
                  ainda repetia o eyebrow logo acima — "Receita provável" e
                  "forecast ponderado" nomeiam a mesma coisa. Os dois textos
                  continuam inteiros, agora na mesma linha: 43px → 22px, e o
                  número passa a encostar no que o sustenta. */}
              <p className="cc6-metric-label mt-1.5 leading-4">
                forecast ponderado{" · "}
                <span className="text-micro text-[var(--atlas-texto-fraco)]">
                  {loading ? "medindo…" : forecastTemLastro ? forecastNota : forecastFalta}
                </span>
              </p>
            </div>

            {!loading && metrics.pesoTotal > 0 ? (
              <BarraDoForecast
                etapas={metrics.porEtapa}
                total={metrics.pesoTotal}
                etapaAtiva={etapaAtiva}
                onEscolherEtapa={recortarPorEtapa}
              />
            ) : null}

            <div className="cc6-hairline mt-auto grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-3">
              {decisive.map((metric) => (
                <div key={metric.label} className="min-w-0">
                  {loading ? (
                    <p className="cc6-metric-value text-numero leading-none">—</p>
                  ) : metric.lastro ? (
                    <p className={`cc6-metric-value text-numero leading-none ${metric.ink}`}>{metric.value}</p>
                  ) : (
                    <p className="cc6-warn text-rotulo font-semibold leading-none">sem lastro</p>
                  )}
                  <p className="cc6-metric-label mt-1">{metric.label}</p>
                  <p className="mt-0.5 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
                    {loading ? "medindo…" : metric.lastro ? metric.nota : metric.falta}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </TiltShell>
      </div>

      <section className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "120ms" }} aria-labelledby="sales-queue-title">
        {/* Cabeçalho, busca, filtros e contador na MESMA faixa: eram três
            linhas para dizer "esta é a fila e assim você a recorta". */}
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 pt-4 pb-3">
          <h2 id="sales-queue-title" className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-corpo font-semibold tracking-tight text-[var(--atlas-texto-forte)]">
            <span className="cc6-eyebrow">Pipeline de receita</span>
            <span>Fila de oportunidades</span>
          </h2>
          <div className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className={CAMPO_BUSCA}
              placeholder="Buscar lead, imóvel ou etapa"
              aria-label="Buscar oportunidades"
            />
            <div className="flex gap-1.5 overflow-x-auto" role="group" aria-label="Filtrar oportunidades">
              {VIEW_OPTIONS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setView(key)}
                  aria-pressed={view === key}
                  /* O vocabulário de bordas do CC-6 tem NOME para os dois
                     papéis usados aqui: `cc6-destaque` (o item escolhido) e
                     `cc6-interativo` (responde ao ponteiro) — os mesmos que os
                     chips de etapa da barra de receita já usam, na mesma tela.
                     Eram duas gramáticas para o mesmo gesto, e a segunda ainda
                     carregava um cinza-ardósia literal que não vira com o tema.
                     Agora as duas dizem o papel, e a cor sai de token. */
                  className={`cc6-chip shrink-0 cursor-pointer ${
                    view === key
                      ? "cc6-destaque text-[var(--atlas-texto-forte)]!"
                      : "cc6-interativo hover:text-[var(--atlas-texto-forte)]!"
                  }`}
                >
                  {label}
                  {key === "attention" ? (
                    <strong className={`font-semibold ${attentionCount ? "cc6-crit" : ""}`}>{attentionCount}</strong>
                  ) : null}
                </button>
              ))}
            </div>
            {/* "12 visíveis" é número sem contexto — visíveis de quantas? Esta
                mesma tela já pagou por isso no chip da fila de decisões, que
                por isso diz "3 de 30". O denominador é a base inteira, não o
                recorte, senão o número se explica por si mesmo e não informa
                nada. */}
            {!loading ? (
              <span className="cc6-chip shrink-0">
                <strong className="font-semibold text-[var(--atlas-texto-forte)]">{visible.length}</strong>
                visíveis de {items.length}
              </span>
            ) : null}
          </div>
        </header>
        {/* Quem chega pelo link não escolheu recorte nenhum — se a fila abrir
            cortada sem dizer, o que falta some sem deixar rastro. */}
        {view === "forecast" ? (
          <div className="cc6-hairline flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-2.5">
            <p className="min-w-56 flex-1 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
              <strong className="font-medium text-[var(--atlas-texto-forte)]">
                {/* "Abrir forecast" também é o rótulo do botão do topo, que leva
                    a OUTRA tela — nomear o link aqui confundiria as duas. */}
                Recorte de forecast{abertoPorLink ? " · pedido pelo link que abriu esta tela" : ""}
              </strong>{" "}
              — apenas negócios em aberto, do maior para o menor impacto provável (valor × probabilidade).
              Oportunidade sem valor não conta como zero: fica no fim, marcada como dados incompletos.
              {etapaAtiva ? ` Recortado pela etapa ${etapaAtiva}, escolhida na barra de receita.` : ""}
            </p>
            <button type="button" onClick={() => { setView("all"); setQuery(""); }} className="cc6-ghost-btn shrink-0">
              Ver a fila inteira
            </button>
          </div>
        ) : null}
        {loading ? (
          <div className="cc6-hairline space-y-2 p-5">
            {[1, 2, 3].map((item) => <AtlasSkeleton key={item} className="h-14" />)}
          </div>
        ) : visible.length ? (
          <div className="overflow-x-auto">
            {/* `text-sm` (14px) era o sexto degrau de uma escala de cinco.
                Corpo é 13. */}
            <table className="w-full min-w-[1040px] text-corpo">
              <thead>
                {/* ── O FILETE QUE NUNCA FOI DESENHADO ──────────────────────
                    `border-b` aqui e `border-t` em cada linha eram DECLARAÇÕES
                    MORTAS: `.atlas-app-shell table` fixa
                    `border-collapse: separate`, e no modelo separado o
                    navegador IGNORA borda em `tr`, `thead` e `tbody` (CSS 2.1
                    §17.6.1). Nenhuma das duas jamais pintou um pixel — MEDIDO:
                    num `<tr>` com `border-top` e `border-bottom` de 1px PRETO,
                    a altura da linha é 44,00px com e sem a borda, e nenhuma
                    linha preta aparece na captura.

                    O que separa as linhas — e sempre separou — é
                    `.atlas-app-shell th, td { border-bottom: … }`, que vem do
                    globals e continua intacto. Some a declaração morta e some
                    com ela o cinza literal que ela carregava; a régua da tabela
                    continua exatamente onde estava. */}
                <tr>
                  <th className={TH_CLASS}>Lead</th>
                  <th className={TH_CLASS}>Imóvel</th>
                  <th className={TH_CLASS}>Etapa</th>
                  <th className={TH_CLASS}>Valor</th>
                  <th className={TH_CLASS}>Forecast</th>
                  <th className={TH_CLASS}>Fechamento</th>
                  <th className={TH_CLASS}>Risco</th>
                  {canManage ? <><th className={TH_CLASS}>SLA comissão</th><th className={TH_CLASS}>Ações</th></> : null}
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => {
                  const risk = opportunityRisk(item); const status = commissionStatus(item); const commissionTone = status === "received" ? "success" : ["overdue", "divergent"].includes(status) ? "danger" : "warning";
                  return (
                    /* `border-t` saiu pelo motivo explicado no `<thead>`. O
                       realce de linha fica: a regra do globals
                       (`tbody tr:hover`) vence esta por especificidade, e é ela
                       que pinta — mas a intenção declarada aqui passa a sair de
                       token em vez de um azul literal. Não subo a dose: sobre o
                       topo do gradiente do painel escuro, `--atlas-texto-fraco`
                       (o texto mais fraco das células) já mede 4,68 com 4% de
                       tinta e cai abaixo de 4,5 com 6%. */
                    <tr key={item.id} className="align-top transition-colors hover:bg-[color-mix(in_srgb,var(--atlas-accent)_4%,transparent)]">
                      <td className="px-4! py-2.5!">
                        {item.leads?.id ? (
                          <Link className="font-medium text-[var(--atlas-texto-forte)] transition-colors hover:text-[color:var(--atlas-accent-hover)]" href={`/leads/${item.leads.id}`}>
                            {item.leads.name || "Lead sem nome"}
                          </Link>
                        ) : (
                          <span className="text-[var(--atlas-texto-fraco)]">Sem lead</span>
                        )}
                      </td>
                      <td className="px-4! py-2.5! text-[var(--atlas-texto-medio)]">{item.properties?.title || "—"}</td>
                      <td className="px-4! py-2.5! text-[var(--atlas-texto-medio)]">{item.stage}</td>
                      <td className="cc6-num px-4! py-2.5! font-medium text-[var(--atlas-texto-forte)]">{item.value == null ? "—" : brl.format(Number(item.value))}</td>
                      <td className="px-4! py-2.5!">
                        <span className="cc6-num block text-[var(--atlas-texto-forte)]">{item.value == null ? "—" : brl.format(Number(item.value) * item.probability / 100)}</span>
                        <span className="cc6-num mt-0.5 block text-micro text-[var(--atlas-texto-fraco)]">{item.probability}%</span>
                      </td>
                      <td className="cc6-num px-4! py-2.5! text-[var(--atlas-texto-medio)]">
                        {item.expected_close_at ? new Date(item.expected_close_at).toLocaleDateString("pt-BR") : <span className="cc6-warn">Definir data</span>}
                      </td>
                      <td className="px-4! py-2.5!"><StatusBadge tone={risk.tone}>{risk.label}</StatusBadge></td>
                      {canManage ? (
                        <>
                          <td className="px-4! py-2.5!">
                            {item.won_at ? (
                              <div>
                                <StatusBadge tone={commissionTone}>{COMMISSION_LABEL[status] ?? status}</StatusBadge>
                                {/* `commission_sla_days ?? 30` imprimia "30 dias" para
                                    TODA venda sem SLA configurado — e a lista viva vem
                                    de `leads`, onde esse campo é nulo por construção. O
                                    30 é o padrão do banco, não uma medida desta venda:
                                    exibi-lo como se fosse medida é número inventado. */}
                                <p className="cc6-num mt-1.5 text-micro text-[var(--atlas-texto-fraco)]">
                                  {item.commission_sla_days == null ? "SLA não definido" : `${item.commission_sla_days} dias`}
                                  {item.commission_net ? ` · ${brl.format(item.commission_received_amount || 0)} de ${brl.format(item.commission_net)}` : ""}
                                </p>
                              </div>
                            ) : (
                              <span className="text-rotulo text-[var(--atlas-texto-fraco)]">Após a venda</span>
                            )}
                          </td>
                          <td className="px-4! py-2.5!">
                            {item.won_at ? (
                              <div className="flex min-w-36 flex-col gap-2">
                                <button disabled={savingId === item.id} onClick={() => configureCommission(item)} className="cc6-ghost-btn justify-center disabled:opacity-50">Configurar</button>
                                <button disabled={savingId === item.id || !item.commission_net} onClick={() => registerPayment(item)} className="atlas-button-primary disabled:opacity-50">Recebimento</button>
                              </div>
                            ) : item.leads?.id ? (
                              <Link className="cc6-ghost-btn" href={`/leads/${item.leads.id}`}>Abrir negócio</Link>
                            ) : null}
                          </td>
                        </>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="cc6-hairline px-5 py-6">
            <AtlasEmpty
              reason={items.length ? "no-results" : "first-use"}
              eyebrow={
                items.length
                  ? "Fila filtrada"
                  : "Pipeline de receita ainda vazio"
              }
              title={
                items.length
                  ? "Nenhuma oportunidade neste filtro"
                  : "Nenhuma oportunidade registrada"
              }
              description={
                items.length
                  ? "Limpe a busca ou altere o filtro para ampliar a fila."
                  : "As oportunidades aparecem quando uma lead avança para um negócio comercial."
              }
              action={
                items.length ? (
                  <button
                    type="button"
                    className="atlas-button-secondary"
                    onClick={() => {
                      setQuery("");
                      setView("all");
                    }}
                  >
                    Limpar filtros
                  </button>
                ) : (
                  <Link href="/pipeline" className="atlas-button-primary">
                    Abrir pipeline
                  </Link>
                )
              }
            />
          </div>
        )}
      </section>
    </div>
  );
}

/* ── O NÚMERO SOZINHO NÃO DIZ ONDE ESTÁ O DINHEIRO ─────────────────────────
   "Forecast ponderado: R$ 4,2 mi" não responde a pergunta seguinte do diretor:
   isso está espalhado pelo funil ou preso numa etapa só? Concentração é
   exatamente o que um número agregado apaga — e é o que decide se a previsão
   sobrevive a um negócio esfriar. Uma barra empilhada de 100% responde de
   relance, e aqui ela também AGE: clicar numa etapa recorta a fila.

   SVG à mão, no mesmo padrão já usado na barra de envelhecimento de
   /distribution — viewBox de 100 unidades, `preserveAspectRatio="none"` e cor
   por `style={{ fill }}`, porque propriedade CSS resolve `var()` e
   `color-mix()`; canvas não resolveria nada disso.

   A rampa é monocromática de propósito: os segmentos já estão ordenados por
   peso, então a intensidade REPETE a ordem em vez de inventar um significado
   novo por matiz. Alfa por `color-mix`, nunca dígito colado no fim do token. */
const RAMPA_ETAPA = (indice: number) =>
  `color-mix(in srgb, var(--atlas-accent) ${Math.max(26, 100 - indice * 17)}%, transparent)`;

function BarraDoForecast({
  etapas,
  total,
  etapaAtiva,
  onEscolherEtapa,
}: {
  etapas: Array<{ etapa: string; peso: number; qtd: number }>;
  total: number;
  etapaAtiva: string;
  onEscolherEtapa: (etapa: string) => void;
}) {
  /* O deslocamento sai de uma soma dos anteriores, não de um acumulador
     mutável: corpo de componente que reatribui variável entre renders é
     justamente o que `react-hooks/immutability` proíbe — e com no máximo uma
     dezena de etapas o custo quadrático é irrelevante perto da garantia de
     que dois renders desenham a mesma barra. */
  const segmentos = etapas
    .map((faixa, indice) => ({
      ...faixa,
      inicio: (etapas.slice(0, indice).reduce((soma, anterior) => soma + anterior.peso, 0) / total) * 100,
      largura: (faixa.peso / total) * 100,
      fatia: Math.round((faixa.peso / total) * 100),
      tinta: RAMPA_ETAPA(indice),
    }))
    .filter((faixa) => faixa.largura > 0);
  if (!segmentos.length) return null;
  const legenda = segmentos.map((faixa) => `${faixa.etapa} ${faixa.fatia}% em ${faixa.qtd} negócio(s)`).join(", ");
  return (
    /* Sem filete entre o herói e esta barra, e de propósito: um filete quer
       dizer "aqui começa outra coisa", e a barra não é outra coisa — é a
       DECOMPOSIÇÃO do número logo acima. Separar os dois com uma linha era
       exatamente a "borda dentro de borda" que o próprio CC-6 catalogou. O
       filete que sobra (antes da grade de quatro números) continua, porque ali
       ele separa mesmo. */
    <div className="px-5 pb-3">
      <svg
        viewBox="0 0 100 8"
        preserveAspectRatio="none"
        className="h-2 w-full"
        role="img"
        aria-label={`Forecast ponderado distribuído por etapa: ${legenda}.`}
      >
        {segmentos.map((faixa) => (
          <rect
            key={faixa.etapa}
            x={faixa.inicio}
            y="0"
            width={Math.max(faixa.largura - 0.6, 0.5)}
            height="8"
            style={{ fill: faixa.tinta }}
          />
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {segmentos.map((faixa) => (
          <button
            key={faixa.etapa}
            type="button"
            onClick={() => onEscolherEtapa(faixa.etapa)}
            aria-pressed={etapaAtiva === faixa.etapa}
            className={`cc6-chip cc6-interativo-acento cursor-pointer ${etapaAtiva === faixa.etapa ? "cc6-destaque" : ""}`}
          >
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: faixa.tinta }} />
            {faixa.etapa}
            <strong className="cc6-num font-semibold text-[var(--atlas-texto-forte)]">{faixa.fatia}%</strong>
          </button>
        ))}
      </div>
      <p className="mt-2 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
        {segmentos.length === 1
          ? `Todo o forecast está numa etapa só (${segmentos[0].etapa}) — clique nela para recortar a fila.`
          : `${segmentos.length} etapas sustentam o forecast · clique numa etapa para recortar a fila.`}
      </p>
    </div>
  );
}
