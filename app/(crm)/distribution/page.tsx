"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { alvoDaIntencao, lerIntencaoDaJanela } from "@/lib/atlas/intencao-da-url";
import { AtlasEmpty, AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { FilaDeAtendimentoPanel } from "@/components/atlas/FilaDeAtendimentoPanel";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";
import { supabase } from "@/lib/supabase";

type Profile = { id: string; full_name: string | null; reports_to: string | null; resolved_role: string };
type Presence = { profile_id: string; availability: string; last_seen_at: string; online: boolean; na_janela_do_motor?: boolean };
type Project = { id: string; name: string; developer_name: string | null; status: string | null };
type Load = { profile_id: string; total: number; by_project: Record<string, number> };
type QueueState = { profile_id: string; development_id: string; enabled: boolean; weight: number; assignments_count: number; last_assigned_at: string | null };
type Capacity = { profile_id:string;max_active_leads:number;max_project_leads:number;warning_percent:number;updated_at:string };
type PriorityRule={development_id:string;source_key:string;priority:number;sla_minutes:number;enabled:boolean;updated_at:string};
type PortfolioAudit={events:Array<{occurredAt:string;eventType:string;brokerId:string|null;leadId:string|null;developmentId:string|null;actorId:string;details:Record<string,unknown>}>;summary:{total:number;distributions:number;transfers:number;reservations:number;returns:number;absences:number;capacityChanges:number};maximum:number;hierarchicalScope:boolean;piiExposed:boolean;immutableSources:boolean;generatedAt:string};
type Assignment = { id:string;development_id:string;lead_id:string;assigned_to:string;created_at:string;score_snapshot:{algorithm?:string;projectLoadBefore?:number;weight?:number;weightedLoadBefore?:number} };
type UnassignedLead={id:string;developmentId:string|null;source:string;status:string;createdAt:string;waitingMinutes:number};
type Payload = { viewer: { id: string; role: string }; rules: { algorithm: string; presenceWindowSeconds: number; onlineOnly: boolean; projectScoped: boolean; weightedLoad: boolean; atomicLock: boolean;singleOwner:boolean;explainable:boolean }; projects: Project[]; profiles: Profile[]; presence: Presence[]; loads: Load[]; queue: QueueState[];capacity:Capacity[];priorityRules:PriorityRule[];leadSources:string[];portfolioAudit:PortfolioAudit;recentAssignments:Assignment[];unassignedQueue:UnassignedLead[];unassignedPolicy:{metadataOnly:boolean;piiExposed:boolean;automaticAssignment:boolean;explicitLeadershipAction:boolean;maximumVisible:number}; unassigned: Record<string, number>; generatedAt: string };

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

/* CC-6: campo, rótulo e chip-botão padronizados; tempo de espera em unidade
   única honesta (min/h/d) reusado no herói e na fila sem responsável. */
/**
 * O FUNDO CRAVADO DESTE CAMPO NUNCA PINTOU NADA — ERA CÓDIGO MORTO QUE PARECIA
 * PERIGO.
 *
 * A leitura à primeira vista acusa catástrofe: o fundo vinha de um arbitrário
 * do Tailwind com azul quase preto cravado, arbitrário não vira com o tema, e
 * `--atlas-texto-forte` no tema claro é quase preto — logo, texto preto sobre
 * fundo preto em todo select e todo input desta tela, justamente no tema que o
 * dono usa. Escrevi esse diagnóstico aqui e ele estava ERRADO.
 *
 * Medido no navegador, com `.atlas-app-shell` no ancestral (que é onde esta
 * página vive de verdade), lendo `getComputedStyle` ANTES e DEPOIS da troca:
 * no tema claro o campo pinta branco com texto quase preto; no escuro, o azul
 * translúcido do app-shell com texto quase branco; `min-height` 44px nos dois.
 *
 * Idêntico nos dois. `:root[data-theme="light"] .atlas-app-shell select` pesa
 * (0,3,1) e ganha do utilitário (0,1,0) — o fundo cravado JAMAIS foi aplicado,
 * em nenhum tema, e o `min-height: 44px` já vinha da mesma regra. A conclusão
 * que a especificidade desmente é a lição: contraste se prova no elemento
 * COMPUTADO dentro do ancestral real, não lendo o className.
 *
 * O que a troca ganha, então, é modesto e verdadeiro: duas cores cravadas a
 * menos no arquivo (a catraca `cor-cravada` desce de 2 para 0 aqui) e uma
 * declaração que deixa de mentir para quem ler depois. Se um dia a regra do
 * app-shell mudar, o token acompanha o tema; o hex não acompanharia.
 */
const FIELD_CLASS =
  "mt-2 min-h-11 w-full rounded-xl border border-[var(--atlas-border)] bg-[var(--atlas-surface-subtle)] px-3 py-2.5 text-sm text-[var(--atlas-texto-forte)] outline-none transition-colors placeholder:text-[var(--atlas-texto-fraco)] focus:border-[color:var(--atlas-accent)] disabled:opacity-50";
const LABEL_CLASS = "block text-xs text-[var(--atlas-texto-fraco)]";
const CHIP_ACTIVE = "border-[color:var(--atlas-accent)]! text-[var(--atlas-texto-forte)]!";
const CHIP_IDLE = "hover:border-[rgba(148,163,184,0.35)]! hover:text-[var(--atlas-texto-forte)]!";

function waitLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / 1440)} d`;
}

/**
 * Cabeçalho de painel em UMA linha, com os dois textos preservados.
 *
 * Cada painel desta tela gastava duas linhas no topo: o eyebrow "Fase NN · …" e
 * o título, empilhados, ~44px antes de a primeira informação começar. São nove
 * painéis: ~200px de altura vendidos para dizer duas vezes onde a pessoa está.
 * Aqui os dois textos continuam inteiros — o título assume a linha de base e a
 * fase vira carimbo de procedência ao lado, que é o papel que ela cumpre para o
 * gestor (nenhum). Adensar não é apagar.
 */
function PanelHead({ titulo, fase, id, nota, children }: { titulo: string; fase: string; id?: string; nota?: ReactNode; children?: ReactNode }) {
  return (
    <header className="px-5 pt-4 pb-2.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <h2 id={id} className="text-base font-semibold tracking-tight text-[var(--atlas-texto-forte)]">{titulo}</h2>
        <p className="cc6-eyebrow text-micro!">{fase}</p>
        {children ? <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">{children}</div> : null}
      </div>
      {/* A regra do painel fica logo abaixo do título, em corpo pequeno e SEM
          `truncate`: é frase, e frase cortada não é frase. */}
      {nota ? <p className="mt-1 text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">{nota}</p> : null}
    </header>
  );
}

/**
 * PERFIL DE ENVELHECIMENTO DA FILA — o gráfico que responde o que o número
 * sozinho não responde.
 *
 * "12 aguardando" e "espera máxima 6 h" descrevem igualmente bem dois mundos
 * opostos: UMA lead velha entre onze recém-chegadas, ou onze leads apodrecendo
 * juntas. A decisão do gestor é diferente em cada um — no primeiro ele
 * distribui a próxima, no segundo ele para e chama o time — e nenhum dos dois
 * números diz em qual deles ele está. A FORMA da fila diz.
 *
 * Cada segmento sai de `waitingMinutes` real da lead; nada é estimado, nada é
 * arredondado para encher barra. Com menos de duas leads não há forma nenhuma
 * para mostrar, e a barra não aparece: o número já é a resposta inteira.
 *
 * As faixas são as mesmas que a tela já usa para decidir tinta (60 min é o
 * limiar de "pressionado" em `conversionSignals` e na lista) — o gráfico não
 * inventa um segundo vocabulário de urgência.
 */
const FAIXAS_DE_ESPERA = [
  { limite: 15, rotulo: "até 15 min", token: "var(--atlas-estado-sucesso)", tinta: "cc6-ok" },
  { limite: 60, rotulo: "15–60 min", token: "var(--atlas-accent)", tinta: "" },
  { limite: 240, rotulo: "1–4 h", token: "var(--atlas-estado-atencao)", tinta: "cc6-warn" },
  { limite: Number.POSITIVE_INFINITY, rotulo: "+4 h", token: "var(--atlas-estado-perigo)", tinta: "cc6-crit" },
] as const;

function perfilDeEspera(fila: UnassignedLead[]) {
  const baldes = FAIXAS_DE_ESPERA.map((faixa) => ({ ...faixa, total: 0 }));
  for (const lead of fila) {
    const balde = baldes.find((item) => lead.waitingMinutes < item.limite) ?? baldes[baldes.length - 1];
    balde.total += 1;
  }
  return baldes;
}

function BarraDeEnvelhecimento({ fila, naFila }: { fila: UnassignedLead[]; naFila: number }) {
  if (fila.length < 2) return null;
  const baldes = perfilDeEspera(fila);
  /* O deslocamento sai da SOMA das faixas anteriores, não de um acumulador
     reatribuído durante o `map`: `react-hooks/immutability` reprova a segunda
     forma (“Cannot reassign variable after render completes”) e o lint desta
     página estava vermelho por causa dela. Mesmo resultado, quatro faixas — o
     custo quadrático aqui é nenhum. */
  const segmentos = baldes
    .map((balde, indice) => ({
      ...balde,
      inicio: baldes.slice(0, indice).reduce((soma, anterior) => soma + (anterior.total / fila.length) * 100, 0),
      largura: (balde.total / fila.length) * 100,
    }))
    .filter((segmento) => segmento.largura > 0);
  const legenda = segmentos.map((segmento) => `${segmento.total} ${segmento.rotulo}`).join(", ");
  /* A fila visível pode ser um recorte: `unassignedQueue` vem limitada pela
     política da rota, enquanto `unassigned[projeto]` é a contagem inteira.
     Quando os dois divergem, a barra descreve a AMOSTRA — e diz isso, em vez
     de deixar a forma de 100 passar por forma de 400. */
  const amostrada = naFila > fila.length;
  return (
    <div className="cc6-hairline px-5 py-3">
      <svg
        viewBox="0 0 100 6"
        preserveAspectRatio="none"
        className="h-1.5 w-full"
        role="img"
        aria-label={`Perfil de espera das ${fila.length} leads visíveis nesta fila: ${legenda}.`}
      >
        {segmentos.map((segmento) => (
          <rect key={segmento.rotulo} x={segmento.inicio} y="0" width={segmento.largura} height="6" fill={segmento.token} />
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {segmentos.map((segmento) => (
          <p key={segmento.rotulo} className="text-micro text-[var(--atlas-texto-fraco)]">
            <span className={`cc6-num text-rotulo font-semibold ${segmento.tinta || "text-[var(--atlas-texto-medio)]"}`}>{segmento.total}</span>{" "}
            {segmento.rotulo}
          </p>
        ))}
        <p className="ml-auto text-micro leading-4 text-[var(--atlas-texto-fraco)]">
          {amostrada
            ? `forma das ${fila.length} leads visíveis, de ${naFila} na fila deste projeto`
            : "forma da fila inteira deste projeto"}
        </p>
      </div>
    </div>
  );
}

/**
 * A ÚNICA fila que o catálogo de navegação promete para esta tela
 * (`lib/atlas/navigation.ts`: "Abrir fila sem responsável" →
 * `/distribution?queue=unassigned`). Fechado de propósito: `?queue=qualquer`
 * não pode recortar a tela em silêncio.
 */
const FILA_SEM_RESPONSAVEL = "unassigned";

/**
 * O projeto onde está a lead sem responsável esperando há mais tempo.
 *
 * A API já devolve `unassignedQueue` ordenada da mais antiga para a mais nova,
 * e `unassigned` só tem projetos que o seletor desta tela oferece — a primeira
 * lead que casa com os dois é a espera mais longa que esta tela CONSEGUE abrir.
 * Devolve "" quando não há nenhuma; nunca um projeto arbitrário.
 */
function projetoComEsperaMaisLonga(payload: Payload): string {
  const maisAntiga = payload.unassignedQueue.find(
    (item) => item.developmentId !== null && (payload.unassigned[item.developmentId] ?? 0) > 0,
  );
  return maisAntiga?.developmentId ?? "";
}

/**
 * Em que projeto a tela abre.
 *
 * Sem intenção na URL, o primeiro da lista — comportamento de sempre. Com
 * `?queue=unassigned`, o projeto que de fato tem gente esperando: abrir no
 * primeiro projeto da lista fazia o botão "Abrir fila sem responsável" mostrar
 * "Fila sem pendências" enquanto outro empreendimento acumulava leads, que é a
 * pior mensagem possível — "não há trabalho" quando há.
 */
function projetoDeAbertura(payload: Payload, fila: string | null): string {
  const primeiro = payload.projects[0]?.id ?? "";
  if (fila !== FILA_SEM_RESPONSAVEL) return primeiro;
  return projetoComEsperaMaisLonga(payload) || primeiro;
}

const AUDIT_EVENT_LABELS: Record<string, string> = {
  distribution: "Distribuição",
  transfer: "Transferência",
  reservation_pending: "Reserva criada",
  reservation_accepted: "Reserva aceita",
  reservation_expired: "Devolução à fila",
  reservation_superseded: "Reserva superada",
  absence: "Cobertura de ausência",
  capacity: "Limite de capacidade",
};

export default function DistributionPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [projectId, setProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [availability, setAvailability] = useState<"available" | "busy" | "offline">("available");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [absenceBrokerId, setAbsenceBrokerId] = useState("");
  const [absenceEndsAt, setAbsenceEndsAt] = useState("");
  const [absenceReason, setAbsenceReason] = useState("");
  const [capacityBrokerId, setCapacityBrokerId] = useState("");
  const [maxActiveLeads, setMaxActiveLeads] = useState(100);
  const [maxProjectLeads, setMaxProjectLeads] = useState(50);
  const [warningPercent, setWarningPercent] = useState(80);
  const [capacityReason, setCapacityReason] = useState("");
  const [prioritySource,setPrioritySource]=useState("");
  const [sourcePriority,setSourcePriority]=useState(5);
  const [sourceSlaMinutes,setSourceSlaMinutes]=useState(60);
  const [priorityReason,setPriorityReason]=useState("");
  const [filaPedida, setFilaPedida] = useState<string | null>(null);
  /* `load` precisa da intenção sem tê-la nas dependências: entrar lá recriaria
     o callback e, com ele, o intervalo de heartbeat/refresh a cada leitura. */
  const filaPedidaRef = useRef<string | null>(null);

  /**
   * A intenção que vinha na URL e era jogada fora.
   *
   * `lib/atlas/navigation.ts` promete "Abrir fila sem responsável" →
   * `/distribution?queue=unassigned`, com o resultado "distribuir oportunidades
   * sem atendimento". Medido em 2026-07-29: esta tela nunca leu o parâmetro.
   * Ela abria no PRIMEIRO projeto da lista — que pode ser justamente o que não
   * tem ninguém esperando — então quem clicava no botão via "Fila sem
   * pendências" com leads paradas em outro empreendimento. A promessa era
   * decorativa, e nenhum teste pegava, porque a tela ABRE: só não faz o que o
   * botão diz.
   *
   * Nada de caminho novo: a intenção só decide o valor inicial de `projectId`,
   * o mesmo estado que o seletor do herói controla — link e clique desembocam
   * no mesmo recorte.
   *
   * A leitura vem do módulo compartilhado (`fila` só existe se a navegação
   * prometer) e ainda exigimos o valor exato: `?queue=inventado` devolve alvo
   * desconhecido e a tela abre como sempre abriu. Parâmetro inválido não pode
   * virar filtro que devolve lista vazia.
   *
   * `window.location.search` em vez de `useSearchParams` pelo motivo de
   * `/leads`: o hook exigiria fronteira <Suspense> nesta página cliente inteira
   * por um parâmetro, e o efeito de montagem já tem a semântica desejada — a
   * URL define o estado inicial e a pessoa assume a partir daí. Declarado antes
   * do efeito de carga para o ref já estar preenchido quando os dados chegarem.
   */
  useEffect(() => {
    const alvo = alvoDaIntencao(lerIntencaoDaJanela(), "fila");
    const pedido = alvo === FILA_SEM_RESPONSAVEL ? alvo : null;
    filaPedidaRef.current = pedido;
    setFilaPedida(pedido);
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const token = await accessToken();
      const response = await fetch("/api/v1/crm/distribution", { headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) setError(result.error?.message || "Falha ao carregar a fila.");
      else {
        setData(result.data);
        // Só na primeira carga (`current` vazio): o refresh de 15 s nunca pode
        // arrastar o projeto debaixo de quem já escolheu outro.
        setProjectId((current) => current || projetoDeAbertura(result.data as Payload, filaPedidaRef.current));
        setError("");
      }
    } catch {
      setError("Não foi possível atualizar a fila comercial agora.");
    } finally {
      setLoading(false);
    }
  }, []);

  const heartbeat = useCallback(async (nextAvailability: "available" | "busy" | "offline" = availability) => {
    const token = await accessToken();
    await fetch("/api/v1/crm/distribution", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "heartbeat", availability: nextAvailability }),
    });
  }, [availability]);

  useEffect(() => {
    void heartbeat().then(() => load());
    const beat = window.setInterval(() => void heartbeat(), 30_000);
    const refresh = window.setInterval(() => void load(true), 15_000);
    return () => { window.clearInterval(beat); window.clearInterval(refresh); };
  }, [heartbeat, load]);

  async function updateAvailability(next: "available" | "busy" | "offline") {
    setAvailability(next);
    await heartbeat(next);
    await load(true);
  }

  async function distribute(limit: number) {
    if (!projectId) return;
    setWorking(true); setError(""); setNotice("");
    const token = await accessToken();
    const response = await fetch("/api/v1/crm/distribution", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "distribute", developmentId: projectId, limit }),
    });
    const result = await response.json();
    if (!response.ok) setError(result.error?.message || "Não foi possível distribuir.");
    else {
      /**
       * O AVISO DIZIA "undefined lead distribuídas".
       *
       * A tela lia `result.data.distributed`. A rota nunca devolveu esse campo:
       * no caminho do motor governado ela responde `{engine, result}`, e no
       * caminho de menor carga em Node, `{assigned, distribution[]}`. Os dois
       * ramos, os dois errados — e nada acusava, porque `undefined` numa
       * template string vira texto e a mensagem aparece verde, como sucesso.
       *
       * O número da RPC vem dentro de `result`, e o nome da chave varia com a
       * versão da função no banco; por isso a leitura tenta as duas formas e,
       * quando nenhuma responde, ADMITE que não sabe em vez de estampar zero.
       * "0 leads distribuídas" seria uma afirmação falsa sobre trabalho que
       * pode ter acontecido.
       */
      const doMotor = result.data?.result as Record<string, unknown> | null | undefined;
      const quantas = typeof result.data?.assigned === "number"
        ? result.data.assigned as number
        : typeof doMotor?.distributed === "number"
          ? doMotor.distributed as number
          : typeof doMotor?.assigned === "number"
            ? doMotor.assigned as number
            : null;
      setNotice(quantas === null
        ? "Distribuição executada pelo motor governado. Confira a fila abaixo: o número exato vem no histórico desta tela."
        : `${quantas} lead${quantas === 1 ? "" : "s"} distribuída${quantas === 1 ? "" : "s"}. Responsável único preservado; a escolha fica explicada no histórico.`);
    }
    await load(true); setWorking(false);
  }

  async function coverAbsence() {
    if (!absenceBrokerId || !absenceEndsAt || absenceReason.trim().length < 10) return;
    if (!window.confirm("Confirmar a cobertura? A carteira comercial ativa será redistribuída dentro da mesma equipe.")) return;
    setWorking(true); setError(""); setNotice("");
    // `brokerId`, não `profileId`. A rota lê `raw.brokerId` para esta ação (as
    // outras duas leem `profileId`), então TODA cobertura de ausência morria em
    // "Informe o corretor ausente" — 400 com um corretor selecionado na tela.
    const response = await fetch("/api/v1/crm/distribution", { method: "POST", headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "cover_absence", brokerId: absenceBrokerId, endsAt: new Date(absenceEndsAt).toISOString(), reason: absenceReason.trim(), limit: 200 }) });
    const result = await response.json();
    if (!response.ok) setError(result.error?.message || "Não foi possível ativar a cobertura.");
    else {
      // Mesmo cuidado do aviso de distribuição: o número vem de dentro de
      // `result` e a chave depende da versão da RPC. Sem número, a frase diz o
      // que aconteceu sem inventar quantidade.
      const transferidas = (result.data?.result as Record<string, unknown> | null | undefined)?.transferred;
      setNotice(typeof transferidas === "number"
        ? `Cobertura registrada: ${transferidas} lead(s) ativa(s) redistribuída(s), com histórico e tarefas preservados.`
        : "Cobertura registrada. A carteira ativa foi redistribuída na mesma equipe, com histórico e tarefas preservados.");
      setAbsenceBrokerId(""); setAbsenceEndsAt(""); setAbsenceReason("");
    }
    await load(true); setWorking(false);
  }

  async function configureCapacity() {
    if (!capacityBrokerId || capacityReason.trim().length < 10 || maxProjectLeads > maxActiveLeads) return;
    setWorking(true); setError(""); setNotice("");
    const response = await fetch("/api/v1/crm/distribution", { method:"POST", headers:{ Authorization:`Bearer ${await accessToken()}`, "Content-Type":"application/json" }, body:JSON.stringify({ action:"configure_capacity", profileId:capacityBrokerId, maxActiveLeads, maxProjectLeads, warningPercent, reason:capacityReason.trim() }) });
    const result=await response.json();
    if(!response.ok)setError(result.error?.message||"Não foi possível atualizar a capacidade.");
    else {
      // A rota responde `{action, result, humanDecided}`; os campos lidos aqui
      // moram dentro de `result`. Lendo do nível de cima, a tela estampava
      // "Capacidade atualizada: undefined leads ativas e undefined por projeto"
      // — em verde, como se tivesse dado certo. Na falta do eco, a frase usa os
      // valores que a própria pessoa acabou de enviar, que são verdade.
      const doMotor = result.data?.result as Record<string, unknown> | null | undefined;
      const ativas = typeof doMotor?.maxActiveLeads === "number" ? doMotor.maxActiveLeads : maxActiveLeads;
      const porProjeto = typeof doMotor?.maxProjectLeads === "number" ? doMotor.maxProjectLeads : maxProjectLeads;
      setNotice(`Capacidade atualizada: ${ativas} leads ativas e ${porProjeto} por projeto.${doMotor?.currentlyOverLimit?" A carteira atual já está acima do novo limite; novas entradas foram bloqueadas.":""}`);
      setCapacityReason("");
    }
    await load(true);setWorking(false);
  }

  async function configurePriority(){
    if(!projectId||!prioritySource||priorityReason.trim().length<10)return;
    setWorking(true);setError("");setNotice("");
    const response=await fetch("/api/v1/crm/distribution",{method:"POST",headers:{Authorization:`Bearer ${await accessToken()}`,"Content-Type":"application/json"},body:JSON.stringify({action:"configure_priority",developmentId:projectId,sourceKey:prioritySource,priority:sourcePriority,slaMinutes:sourceSlaMinutes,enabled:true,reason:priorityReason.trim()})});
    const result=await response.json();
    if(!response.ok)setError(result.error?.message||"Não foi possível salvar a prioridade.");
    else{
      // Mesma doença dos outros dois avisos: os campos moram em `result.result`.
      // Sem eco do banco, a frase repete o que foi enviado — que é o que a
      // pessoa acabou de decidir, e não um `undefined` vestido de sucesso.
      const doMotor = result.data?.result as Record<string, unknown> | null | undefined;
      const origem = typeof doMotor?.sourceKey === "string" ? doMotor.sourceKey : prioritySource;
      const prioridade = typeof doMotor?.priority === "number" ? doMotor.priority : sourcePriority;
      const sla = typeof doMotor?.slaMinutes === "number" ? doMotor.slaMinutes : sourceSlaMinutes;
      setNotice(`Regra salva para ${origem}: prioridade ${prioridade}, SLA ${sla} minutos.`);
      setPriorityReason("");
    }
    await load(true);setWorking(false);
  }

  const presenceMap = useMemo(() => new Map((data?.presence ?? []).map((item) => [item.profile_id, item])), [data]);
  const loadMap = useMemo(() => new Map((data?.loads ?? []).map((item) => [item.profile_id, item])), [data]);
  const stateMap = useMemo(() => new Map((data?.queue ?? []).filter((item) => item.development_id === projectId).map((item) => [item.profile_id, item])), [data, projectId]);
  const capacityMap = useMemo(() => new Map((data?.capacity ?? []).map((item) => [item.profile_id,item])),[data]);
  const profilesMap = useMemo(() => new Map((data?.profiles ?? []).map((item) => [item.id, item])), [data]);
  const managers = (data?.profiles ?? []).filter((item) => item.resolved_role === "manager" && (data?.viewer.role !== "superintendent" || item.reports_to === data.viewer.id) && presenceMap.get(item.id)?.online);
  const teamBrokers = (data?.profiles ?? []).filter((item) => item.resolved_role === "broker" && (data?.viewer.role !== "manager" || item.reports_to === data.viewer.id));
  /**
   * QUEM A FILA ALCANÇA — a lista que decide se o botão pode ser clicado.
   *
   * Esta lista exigia `availability === "available"`, que é a bandeira que a
   * pessoa levanta. O motor governado exige outra coisa: linha em
   * `commercial_presence` com `last_seen_at` nos últimos 90 segundos. As duas
   * divergem por horas — a bandeira fica levantada com o Atlas fechado.
   *
   * Enquanto a tela contava a bandeira, ela habilitava "Distribuir próxima" com
   * "3 corretores disponíveis" e o banco recusava por não achar candidato
   * nenhum. Contar o que o motor conta é a diferença entre um botão que promete
   * e um botão que cumpre.
   */
  const brokers = (data?.profiles ?? []).filter((item) => item.resolved_role === "broker" && presenceMap.get(item.id)?.na_janela_do_motor && stateMap.get(item.id)?.enabled !== false).sort((a, b) => {
    const aLoad = (loadMap.get(a.id)?.by_project[projectId] ?? 0) / (stateMap.get(a.id)?.weight || 1);
    const bLoad = (loadMap.get(b.id)?.by_project[projectId] ?? 0) / (stateMap.get(b.id)?.weight || 1);
    if (aLoad !== bLoad) return aLoad - bLoad;
    return (stateMap.get(a.id)?.last_assigned_at || "").localeCompare(stateMap.get(b.id)?.last_assigned_at || "");
  });
  /** Quem levantou a bandeira, esteja à mesa ou não. Denominador do sinal abaixo. */
  const marcadosDisponiveis = (data?.profiles ?? []).filter(
    (item) => item.resolved_role === "broker" && presenceMap.get(item.id)?.availability === "available",
  ).length;
  const selectedProject = data?.projects.find((item) => item.id === projectId);
  const unassigned = data?.unassigned[projectId] ?? 0;
  const weightedLoads = brokers.map((broker) => (loadMap.get(broker.id)?.by_project[projectId] ?? 0) / (stateMap.get(broker.id)?.weight || 1));
  const balanceGap = weightedLoads.length > 1 ? Math.round((Math.max(...weightedLoads) - Math.min(...weightedLoads)) * 10) / 10 : 0;
  const selectedQueue = (data?.unassignedQueue ?? []).filter((item) => !projectId || item.developmentId === projectId);
  /* Números do recorte, derivados a cada render em vez de congelados na
     abertura: se a pessoa trocar o projeto no seletor, o aviso continua
     descrevendo o que ela está vendo, e não o que ela viu ao chegar. */
  const filaSemResponsavelPedida = filaPedida === FILA_SEM_RESPONSAVEL;
  const aguardandoNosProjetos = data ? Object.values(data.unassigned).reduce((soma, valor) => soma + valor, 0) : 0;
  const aguardandoEmOutrosProjetos = Math.max(0, aguardandoNosProjetos - unassigned);
  /* Lead sem responsável E sem empreendimento no seletor: some de QUALQUER
     recorte desta tela, porque distribuir aqui é sempre dentro de um projeto.
     Contar como zero seria dizer "não há trabalho" sobre trabalho existente. */
  const semProjetoVinculado = data
    ? data.unassignedQueue.filter((item) => item.developmentId === null || data.unassigned[item.developmentId] === undefined).length
    : 0;
  const abertaNaEsperaMaisLonga = Boolean(data && projectId && projetoComEsperaMaisLonga(data) === projectId);
  const oldestWaitingMinutes = selectedQueue.reduce((maximum, item) => Math.max(maximum, item.waitingMinutes), 0);
  /**
   * FILA QUE EXISTE E NÃO APARECE — "não há trabalho" contra "o trabalho não
   * coube na amostra".
   *
   * Os dois números desta tela têm alcances diferentes, e nenhum comentário
   * dizia isso. `unassignedQueue` é o recorte das 100 leads sem responsável
   * mais ANTIGAS da estrutura inteira: `app/api/v1/crm/distribution/route.ts`
   * ordena por criação e corta em 100 ANTES de qualquer filtro de projeto.
   * `unassigned[projeto]` é a contagem cheia daquele projeto. Basta a
   * organização ter mais de 100 leads paradas para um projeto cujas leads sejam
   * todas mais novas que essas 100 aparecer com lista vazia e contagem
   * positiva ao mesmo tempo.
   *
   * O que a tela fazia nesse caso: estampava “Distribuição em dia · Fila sem
   * pendências” — com os dois botões de distribuir HABILITADOS logo acima, já
   * que eles nunca dependeram da lista e sim de `unassigned`. Afirmar que não
   * há trabalho quando há é a pior mensagem que esta tela pode dar, e é o mesmo
   * defeito que o link “Abrir fila sem responsável” já produziu uma vez.
   */
  const filaForaDaAmostra = unassigned > 0 && selectedQueue.length === 0;
  /**
   * ONDE ESTÁ A FILA — o “+N em outros projetos” que não dizia em quais.
   *
   * O herói informa que existe trabalho fora do recorte atual e o único caminho
   * para descobrir onde era abrir o seletor e trocar de projeto uma vez por
   * empreendimento, olhando o número mudar. A pergunta “37 espalhadas ou 37 num
   * projeto só?” decide ações opostas — reforçar um time ou redistribuir entre
   * todos — e nenhum dos dois números do herói a responde.
   *
   * Cada linha sai de `unassigned`, que é a contagem cheia por projeto vinda da
   * rota; nada é somado, estimado ou completado aqui. Some da tela quando não
   * há fila em outro projeto: aí o herói já respondeu sozinho.
   */
  const filasPorProjeto = data
    ? data.projects
        .map((project) => ({ id: project.id, name: project.name, total: data.unassigned[project.id] ?? 0 }))
        .filter((item) => item.total > 0)
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR"))
    : [];
  const brokersNearCapacity = teamBrokers.filter((broker) => {
    const capacity = capacityMap.get(broker.id);
    if (!capacity) return false;
    const currentLoad = loadMap.get(broker.id)?.total ?? 0;
    return currentLoad >= capacity.max_active_leads * (capacity.warning_percent / 100);
  }).length;
  /**
   * Quantos corretores TÊM limite cadastrado — o denominador sem o qual
   * `brokersNearCapacity` mente.
   *
   * `brokersNearCapacity` só conta quem tem linha em `capacity`. Sem nenhuma
   * linha ele vale 0, e 0 na tela lê-se "ninguém perto do limite" quando o fato
   * é "ninguém tem limite". É o precedente do `usageCost`: zero parece saudável,
   * a ausência é que diz a verdade — por isso a métrica mostra "—" e a frase do
   * que falta, nunca um zero tranquilizador.
   */
  const carteirasComLimite = teamBrokers.filter((broker) => capacityMap.has(broker.id)).length;
  const conversionSignals = [
    unassigned > 0 ? { title: "Leads aguardando responsável", value: String(unassigned), detail: "A liderança decide quando liberar a próxima distribuição." } : null,
    oldestWaitingMinutes >= 60 ? { title: "SLA de entrada pressionado", value: oldestWaitingMinutes < 1440 ? `${Math.floor(oldestWaitingMinutes / 60)} h` : `${Math.floor(oldestWaitingMinutes / 1440)} d`, detail: "Tempo da lead mais antiga na fila selecionada." } : null,
    unassigned > 0 && brokers.length === 0 ? { title: "Sem capacidade online", value: "AÇÃO", detail: "Há demanda, mas nenhum corretor elegível está disponível agora." } : null,
    /**
     * A DIFERENÇA ENTRE "MARCOU DISPONÍVEL" E "ESTÁ AÍ".
     *
     * Sem este sinal, um time inteiro com a bandeira levantada e o Atlas fechado
     * aparece como zero disponíveis, e o gestor não tem como saber por quê —
     * conclui que ninguém marcou presença quando todos marcaram, só não estão à
     * mesa. O motor exige batimento nos últimos 90 segundos.
     */
    marcadosDisponiveis > brokers.length
      ? {
        title: "Marcados como disponíveis, mas fora da janela",
        value: String(marcadosDisponiveis - brokers.length),
        detail: "A bandeira está levantada e o Atlas está fechado. A distribuição só alcança quem deu sinal nos últimos 90 segundos.",
      }
      : null,
    brokersNearCapacity > 0 ? { title: "Carteiras próximas do limite", value: String(brokersNearCapacity), detail: "Apoie o time antes de distribuir novos atendimentos." } : null,
    balanceGap > 1 ? { title: "Desvio de carga no projeto", value: String(balanceGap), detail: "Revise peso, presença e capacidade antes de um novo lote." } : null,
    /* O `.slice(0, 3)` que existia aqui descartava em silêncio o quarto e o
       quinto sinal — e o descarte era por ordem de declaração, não por
       gravidade: "sem capacidade online" sumia se três sinais mais brandos
       tivessem disparado antes. Com cada sinal ocupando uma linha em vez de um
       cartão, os cinco cabem; esconder deixou de pagar altura. */
  ].filter((signal): signal is { title: string; value: string; detail: string } => Boolean(signal));

  function openCapacityCopilot() {
    window.dispatchEvent(new CustomEvent("atlas:open-copilot", { detail: {
      prompt: `Analise uma fila comercial do projeto ${selectedProject?.name || "selecionado"} com ${unassigned} leads aguardando, ${brokers.length} corretores disponíveis, espera máxima de ${oldestWaitingMinutes} minutos, ${brokersNearCapacity} carteiras próximas do limite e desvio de carga ${balanceGap}. Sugira até três decisões para proteger velocidade e conversão. Não distribua leads, não altere capacidade e não envie mensagens.`,
      context: { module: "distribution-capacity", projectId: projectId || null, humanApprovalRequired: true },
    } }));
  }

  /**
   * Os números do herói, em ordem de consequência — e cada um com o que lhe dá
   * escala.
   *
   * "aguardando no projeto" é O número que decide se existe trabalho agora, e é
   * o único em tamanho de herói. Os demais comparam-se entre si no degrau de
   * número. "carteiras no limite" entra aqui vindo de dentro do painel de
   * sinais, onde só aparecia quando disparava — a saúde da equipe não pode ser
   * visível somente no dia em que já é problema.
   *
   * `hint` existe porque número sem escala não decide nada: "desvio 3" não diz
   * se 3 é muito, e "2 carteiras no limite" não diz de quantas.
   */
  const heroMetrics = [
    { label: "aguardando no projeto", value: loading ? "—" : String(unassigned), ink: !loading && unassigned > 0 ? "cc6-warn" : "", heroi: true, hint: aguardandoEmOutrosProjetos > 0 ? `+${aguardandoEmOutrosProjetos} em outros projetos` : "sem responsável", title: "Leads sem responsável no projeto selecionado." },
    { label: "corretores disponíveis", value: loading ? "—" : String(brokers.length), ink: !loading && !brokers.length && unassigned > 0 ? "cc6-crit" : "", heroi: false, hint: marcadosDisponiveis > brokers.length ? `${marcadosDisponiveis} marcados, ${brokers.length} à mesa` : `de ${teamBrokers.length} na estrutura`, title: "Com sinal nos últimos 90 segundos e elegíveis neste projeto — é exatamente quem o motor de distribuição alcança. Marcar-se disponível não basta: o Atlas precisa estar aberto." },
    { label: "espera máxima", value: loading || !selectedQueue.length ? "—" : waitLabel(oldestWaitingMinutes), ink: !loading && oldestWaitingMinutes >= 60 ? "cc6-warn" : "", heroi: false, hint: "pressiona acima de 1 h", title: "Tempo da lead mais antiga sem responsável na fila selecionada." },
    {
      label: "carteiras no limite",
      /* Sem NENHUM limite cadastrado a métrica não vale zero: vale nada. */
      value: loading ? "—" : carteirasComLimite === 0 ? "—" : String(brokersNearCapacity),
      ink: !loading && carteirasComLimite > 0 && brokersNearCapacity > 0 ? "cc6-warn" : "",
      heroi: false,
      hint: carteirasComLimite === 0 ? "sem lastro: nenhum limite" : `de ${carteirasComLimite} com limite`,
      title: carteirasComLimite === 0
        ? "Nenhum corretor da sua estrutura tem limite de carteira cadastrado — sem limite não há como medir proximidade do teto. Defina em “Limites de carteira por corretor”, abaixo."
        : "Corretores cujo total ativo já passou do percentual de aviso do próprio limite.",
    },
    { label: "desvio de carga", value: loading || weightedLoads.length < 2 ? "—" : String(balanceGap), ink: !loading && balanceGap > 1 ? "cc6-warn" : "", heroi: false, hint: "leads entre o topo e a base", title: "Diferença entre a maior e a menor carga ponderada dos corretores elegíveis neste projeto." },
    { label: "gestores online", value: loading ? "—" : String(managers.length), ink: "", heroi: false, hint: "liderança ao vivo", title: "Gerentes diretamente subordinados a você que estão online agora." },
  ];

  return (
    <div className="space-y-4 pb-10" data-phase="51-explainable-distribution" data-evolution-phase="46" data-distribution-layout="capacity-first">
      <PageHeader
        eyebrow="Distribuição comercial · Fila ao vivo"
        title="Quem recebe a próxima lead"
        description="Disponibilidade, projeto, carteira e última atribuição definem a ordem — cada gestor enxerga somente a própria estrutura."
      />

      {/* Quem chegou pelo link não pode olhar um recorte sem saber que é um
          recorte: o seletor logo abaixo veio preenchido por decisão da tela, e
          não da pessoa. Fica no topo, acima do seletor que ele explica, em vez
          de rolar até a fila — a declaração não pode ficar fora da vista. */}
      {filaSemResponsavelPedida ? (
        <section aria-label="Recorte pedido pelo link de origem">
          <div className="cc6-panel-quiet px-4 py-3" role="status" aria-live="polite">
            <p className="cc6-eyebrow">Aberto por “Abrir fila sem responsável”</p>
            {!data ? (
              /* Enquanto a fila não chegou, "0" seria invenção: ausência de
                 dado não vira número — e fila que não carregou não pode ser
                 anunciada como fila vazia. */
              <p className="mt-1.5 text-sm leading-6 text-[var(--atlas-texto-medio)]">
                {error ? "Não deu para conferir a fila sem responsável agora — o erro abaixo explica o que falhou." : "Conferindo quantas leads estão sem responsável na sua estrutura…"}
              </p>
            ) : aguardandoNosProjetos > 0 ? (
              <p className="mt-1.5 text-sm leading-6 text-[var(--atlas-texto-forte)]">
                A tela está recortada no projeto <strong className="font-semibold">{selectedProject?.name || "selecionado"}</strong>:{" "}
                <span className="cc6-num">{unassigned}</span> lead{unassigned === 1 ? "" : "s"} sem responsável aqui
                {abertaNaEsperaMaisLonga ? ", onde está a espera mais longa da sua estrutura" : ""}.
                {aguardandoEmOutrosProjetos > 0 ? (
                  <>
                    {" "}Outros projetos somam <span className="cc6-num">{aguardandoEmOutrosProjetos}</span> — troque o projeto acima para abri-los.
                  </>
                ) : null}
              </p>
            ) : (
              /* Fila vazia DECLARADA. Sem esta frase, a mesma tela apareceria
                 como se o link não tivesse funcionado. */
              <p className="mt-1.5 text-sm leading-6 text-[var(--atlas-texto-forte)]">
                Nenhuma lead sem responsável nos projetos da sua estrutura agora — a fila que você pediu está vazia, e isso é uma afirmação, não uma lista escondida por filtro. O restante da tela segue completo abaixo.
              </p>
            )}
            {semProjetoVinculado > 0 ? (
              <p className="cc6-warn mt-1.5 text-xs leading-5">
                {semProjetoVinculado} lead{semProjetoVinculado === 1 ? "" : "s"} sem responsável ficam fora de qualquer recorte desta tela por não terem empreendimento vinculado — a distribuição daqui acontece sempre dentro de um projeto.
              </p>
            ) : null}
            {aguardandoNosProjetos > 0 ? (
              <a href="#fila-sem-responsavel" className="cc6-chip cc6-interativo mt-2.5 inline-block hover:text-[var(--atlas-texto-forte)]!">
                Ir para a fila ↓
              </a>
            ) : null}
          </div>
        </section>
      ) : null}

      {/**
        * PAINEL DE COMANDO — dois painéis viraram um, e o segundo era eco do
        * primeiro.
        *
        * Medido antes: o herói mostrava `aguardando`, `espera máxima` e `desvio
        * de carga`; o painel "Antes de distribuir", 300px abaixo, repetia os
        * TRÊS com outro rótulo e uma frase de apoio — mais "sem capacidade
        * online", que é a conjunção de outros dois números do mesmo herói.
        * Quatro dos cinco sinais eram o mesmo dado dito duas vezes, em dois
        * quadros, com dois cabeçalhos. É exatamente o rótulo repetido que o dono
        * apontou: caixa dentro de caixa para não acrescentar informação.
        *
        * Agora o número e o que ele exige ficam ENCOSTADOS: a métrica dá a
        * grandeza, a linha logo abaixo dá a consequência e o gesto. Nada foi
        * removido — os cinco sinais, o botão de IA, a nota de privacidade e o
        * vazio "Fila equilibrada" continuam todos aqui, em uma linha cada em vez
        * de um cartão cada.
        */}
      <section aria-label="Contexto e números da distribuição" data-phase="46-distribution-capacity-decision">
        <TiltShell className="cc6-panel cc6-reveal overflow-hidden" delayMs={0}>
          <div className="flex flex-col gap-5 p-5 sm:p-6 sm:pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 lg:max-w-xs lg:flex-1">
              <label className="cc6-eyebrow" htmlFor="project">Projeto da distribuição</label>
              <select id="project" value={projectId} onChange={(event) => setProjectId(event.target.value)} className={FIELD_CLASS}>
                <option value="">Selecione um projeto</option>
                {data?.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
              <p className="mt-1.5 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">{selectedProject?.developer_name || "Incorporadora não informada"}</p>
              {/* Encostado no seletor porque é o mesmo gesto: ler onde está a
                  fila e trocar o recorte. Chip é botão — o alvo de 44px vem do
                  `button.cc6-chip::after` do próprio produto, sem gastar 44px de
                  altura visível. `whitespace-normal!` porque nome comprido de
                  empreendimento precisa quebrar dentro do chip; nome cortado
                  com reticências não identifica projeto nenhum. */}
              {aguardandoEmOutrosProjetos > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Projetos com lead aguardando responsável">
                  {filasPorProjeto.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setProjectId(item.id)}
                      aria-pressed={item.id === projectId}
                      title={`${item.total} lead(s) sem responsável em ${item.name}. Clique para recortar a tela neste projeto.`}
                      className={`cc6-chip cc6-interativo max-w-full cursor-pointer whitespace-normal! ${item.id === projectId ? CHIP_ACTIVE : CHIP_IDLE}`}
                    >
                      {item.name} <strong className="cc6-num font-semibold text-[var(--atlas-texto-forte)]">{item.total}</strong>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {/* GRADE, NÃO `flex-wrap`. Medido no navegador em 1320px: com
                `flex flex-wrap` os seis blocos não quebravam linha — encolhiam,
                porque item de flex encolhe por padrão — e os rótulos colavam uns
                nos outros ("corretores disponíveisespera máxima"). Cada coluna
                da grade tem largura própria, então o rótulo e a legenda quebram
                DENTRO da coluna em vez de invadir a vizinha. Nada de `truncate`
                aqui: legenda cortada não informa escala nenhuma. */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 xl:grid-cols-6" aria-busy={loading}>
              {heroMetrics.map((metric) => (
                <div key={metric.label} className="min-w-0" title={metric.title}>
                  <p className={`cc6-metric-value leading-none ${metric.heroi ? "text-heroi" : "text-numero"} ${metric.ink}`}>{metric.value}</p>
                  <p className="cc6-metric-label mt-1.5 text-rotulo! leading-4">{metric.label}</p>
                  <p className="mt-0.5 text-micro leading-4 text-[var(--atlas-texto-fraco)]">{metric.hint}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="cc6-hairline flex flex-wrap items-baseline gap-x-3 gap-y-2 px-5 pt-3 pb-1.5">
            <h2 className="text-corpo font-semibold tracking-tight text-[var(--atlas-texto-forte)]">Antes de distribuir</h2>
            <p className="cc6-eyebrow text-micro!">Fase 46 · Proteção da conversão</p>
            <button type="button" onClick={openCapacityCopilot} disabled={!projectId || loading} className="cc6-ghost-btn ml-auto disabled:opacity-50">
              ✦ Preparar decisão com IA
            </button>
          </div>
          {conversionSignals.length ? (
            conversionSignals.map((signal, index) => (
              <div
                key={signal.title}
                className="cc6-reveal cc6-sev-band flex items-baseline gap-3 px-5 py-2"
                style={{ animationDelay: `${100 + index * 60}ms`, "--cc6-sev": "var(--atlas-estado-atencao)" } as CSSProperties}
              >
                <span className="cc6-metric-value cc6-warn w-12 shrink-0 text-right text-corpo">{signal.value}</span>
                {/* Título e detalhe na MESMA frase corrida: sem `truncate`, sem
                    segunda linha reservada para um texto que quase sempre cabe
                    em uma. O que não cabe quebra e continua legível. */}
                <p className="min-w-0 flex-1 text-corpo leading-5 text-[var(--atlas-texto-fraco)]">
                  <strong className="font-medium text-[var(--atlas-texto-forte)]">{signal.title}</strong>{" "}
                  {signal.detail}
                </p>
              </div>
            ))
          ) : (
            <div className="px-5 pb-2">
              <AtlasEmpty
                reason="no-activity"
                eyebrow="Fila equilibrada"
                title="Sem pressão crítica na fila selecionada"
                description="Presença, espera e carga seguem monitoradas."
              />
            </div>
          )}
          <p className="px-5 pb-3 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
            IA analisa sem PII · a fila entra sem atribuição automática · distribuir, alterar limites e aprovar continuam decisões humanas.
          </p>

          <div className="cc6-hairline flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
            <p className="cc6-eyebrow text-micro!">Minha disponibilidade</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Minha disponibilidade na fila">
              {([{ key: "available", label: "Disponível" }, { key: "busy", label: "Ocupado" }, { key: "offline", label: "Sair da fila" }] as const).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => void updateAvailability(option.key)}
                  aria-pressed={availability === option.key}
                  className={`cc6-chip cursor-pointer transition-colors ${availability === option.key ? CHIP_ACTIVE : CHIP_IDLE}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-rotulo text-[var(--atlas-texto-fraco)]">Atualiza a fila em até 15 s · somente “Disponível” recebe leads.</p>
          </div>
        </TiltShell>
      </section>

      {error ? <AtlasRecoverableError description={error} onRetry={() => void load()} busy={loading} /> : null}
      {notice ? <div className="cc6-panel-quiet cc6-ok px-4 py-3 text-sm leading-6" role="status" aria-live="polite">{notice}</div> : null}

      {/* Alvo do "Ir para a fila" do aviso de recorte — âncora estável. */}
      <section id="fila-sem-responsavel" className="scroll-mt-6" data-phase="52-unassigned-lead-queue">
        <div className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "100ms" }}>
          <PanelHead titulo="Leads aguardando distribuição" fase="Fase 52 · Fila sem responsável">
            <button
              type="button"
              disabled={working || !projectId || !brokers.length || !unassigned}
              onClick={() => void distribute(Math.min(100, unassigned))}
              className="cc6-ghost-btn disabled:opacity-50"
            >
              {working ? "Equilibrando..." : "Equilibrar pendentes"}
            </button>
            <button
              type="button"
              disabled={working || !projectId || !brokers.length || !unassigned}
              onClick={() => void distribute(1)}
              className="atlas-button-primary disabled:opacity-50"
            >
              Distribuir próxima
            </button>
          </PanelHead>
          <BarraDeEnvelhecimento fila={selectedQueue} naFila={unassigned} />
          {loading && !data ? (
            /* Enquanto a fila não chegou, esta caixa estampava “Distribuição em
               dia · Fila sem pendências”: uma afirmação sobre dado que ainda não
               existe, mostrada em TODA abertura da tela. O painel dos corretores
               ao lado já usava esqueleto; a fila, que é o assunto da página,
               não. */
            <div className="cc6-hairline space-y-2 p-5" aria-busy="true">
              {[1, 2, 3].map((item) => <AtlasSkeleton key={item} className="h-10" />)}
            </div>
          ) : selectedQueue.length ? (
            selectedQueue.slice(0, 12).map((item, index) => {
              const pressured = item.waitingMinutes >= 60;
              return (
                <article
                  key={item.id}
                  className={`cc6-reveal cc6-hairline flex items-center gap-4 px-5 py-3 ${pressured ? "cc6-sev-band" : ""}`}
                  style={{ animationDelay: `${120 + Math.min(index, 8) * 45}ms`, ...(pressured ? { "--cc6-sev": "var(--atlas-estado-atencao)" } : {}) } as CSSProperties}
                >
                  <strong className="cc6-num shrink-0 text-sm font-medium text-[var(--atlas-texto-forte)]">Lead {item.id.slice(0, 8)}</strong>
                  {/* A origem é a chave da regra de prioridade configurada mais
                      abaixo nesta mesma tela: cortá-la com reticências esconde
                      justamente o critério que explica a posição da lead. */}
                  <span className="min-w-0 flex-1 text-xs leading-4 text-[var(--atlas-texto-fraco)]">{item.source} · {item.status}</span>
                  <span className={`cc6-num shrink-0 text-xs ${pressured ? "cc6-warn" : "text-[var(--atlas-texto-medio)]"}`}>{waitLabel(item.waitingMinutes)}</span>
                </article>
              );
            })
          ) : filaForaDaAmostra ? (
            <div className="cc6-hairline cc6-sev-band px-5 py-3.5" style={{ "--cc6-sev": "var(--atlas-estado-atencao)" } as CSSProperties}>
              <p className="text-corpo leading-5 text-[var(--atlas-texto-forte)]">
                <span className="cc6-num cc6-warn font-semibold">{unassigned}</span> lead{unassigned === 1 ? "" : "s"} sem responsável neste projeto — e nenhuma delas está entre as 100 mais antigas da sua estrutura, que é o recorte carregado nesta lista. O detalhe não cabe aqui, mas o trabalho existe: distribuir continua liberado e atende sempre a lead mais antiga <strong className="font-semibold">deste</strong> projeto.
              </p>
            </div>
          ) : (
            <div className="cc6-hairline px-5 py-4">
              <AtlasEmpty
                reason="completed"
                eyebrow="Distribuição em dia"
                title="Fila sem pendências"
                description="Nenhuma lead sem responsável no projeto selecionado."
                action={
                  <Link href="/pipeline" className="atlas-button-secondary">
                    Revisar pipeline
                  </Link>
                }
              />
            </div>
          )}
          {/* O `slice(0, 12)` acima nunca se anunciou. Com 40 leads na fila a
              pessoa via 12 linhas e nenhuma frase dizendo que havia mais — e a
              nota falava em “até 100 visíveis”, que é o teto da AMOSTRA vinda
              da rota (as 100 mais antigas da estrutura inteira), não o que a
              lista mostra. Dois recortes, nenhum declarado. Ambos os números
              são reais: o exibido e o total do projeto. */}
          <p className="cc6-hairline px-5 py-2.5 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
            {selectedQueue.length ? `Mostrando as ${Math.min(12, selectedQueue.length)} mais antigas de ${unassigned} na fila deste projeto · ` : ""}
            Somente metadados, amostra de até 100 leads mais antigas da estrutura — sem nome, telefone ou e-mail · a distribuição atribui atomicamente a lead mais antiga do projeto, sempre por decisão explícita da liderança.
          </p>
        </div>
      </section>

      {/* Quem recebe: a ordem ponderada com nomes fortes; liderança ao lado. */}
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="cc6-panel cc6-reveal self-start overflow-hidden" style={{ animationDelay: "140ms" }} aria-labelledby="distribution-order-title">
          <PanelHead titulo="Ordem de recebimento" fase="Fila de corretores" id="distribution-order-title">
            {!loading && weightedLoads.length > 1 ? (
              <span className={`cc6-chip ${balanceGap > 1 ? "cc6-warn cc6-atencao" : ""}`} title="Diferença entre a maior e a menor carga ponderada dos corretores elegíveis neste projeto.">
                desvio {balanceGap}
              </span>
            ) : null}
          </PanelHead>
          <div aria-busy={loading}>
            {loading ? (
              <div className="cc6-hairline space-y-2 p-5">
                {[1, 2, 3].map((item) => <AtlasSkeleton key={item} className="h-14" />)}
              </div>
            ) : brokers.length === 0 ? (
              <div className="cc6-hairline px-5 py-5">
                <AtlasEmpty
                  reason="not-configured"
                  eyebrow="Fila aguardando disponibilidade"
                  title="Nenhum corretor disponível"
                  description="O corretor entra na fila ao acessar o Atlas com a disponibilidade ativa."
                  action={
                    <Link href="/brokers" className="atlas-button-secondary">
                      Revisar equipe
                    </Link>
                  }
                />
              </div>
            ) : (
              brokers.map((broker, index) => {
                const brokerLoad = loadMap.get(broker.id);
                const manager = broker.reports_to ? profilesMap.get(broker.reports_to) : null;
                const state = stateMap.get(broker.id);
                const projectLoad = brokerLoad?.by_project[projectId] ?? 0;
                return (
                  <article
                    key={broker.id}
                    className="cc6-reveal cc6-hairline flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-[rgba(75,141,248,0.04)]"
                    style={{ animationDelay: `${160 + Math.min(index, 8) * 45}ms` }}
                  >
                    <span className={`cc6-metric-value w-8 shrink-0 text-center text-lg ${index === 0 ? "text-[color:var(--atlas-accent)]!" : "text-[var(--atlas-texto-fraco)]!"}`} aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-[var(--atlas-texto-forte)]">{broker.full_name || "Corretor"}</h3>
                        {index === 0 ? <StatusBadge tone="info">Próximo</StatusBadge> : null}
                      </div>
                      {/* SEM `truncate`: esta linha é a JUSTIFICATIVA da posição
                          na fila, não um rótulo. O rodapé deste painel promete
                          “ordem por carga ponderada e última atribuição” — e a
                          última atribuição é o último item da frase, ou seja,
                          exatamente o que as reticências comiam primeiro. Nesta
                          coluna, em tablet e com nome de gestor comprido, o
                          gestor lia “Time Fulano de Tal · peso 1 · última
                          atrib…” e perdia o desempate que ordena a lista. */}
                      <p className="mt-0.5 text-xs leading-4 text-[var(--atlas-texto-fraco)]">
                        Time {manager?.full_name || "comercial"} · peso {state?.weight || 1} · última atribuição {state?.last_assigned_at ? new Date(state.last_assigned_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "ainda não recebeu"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="cc6-metric-value text-lg leading-none">{projectLoad}</p>
                      {/* A ponderação só é anunciada quando existe peso diferente
                          de 1. Sem `project_distribution_members` cadastrado —
                          zero linhas nesta base — todo peso é 1, a divisão não
                          muda nada, e "pond." prometia um critério que a fila
                          não aplica. A API já declara `weightedLoad: false`; a
                          tela agora concorda com ela. */}
                      {state?.weight && state.weight !== 1 ? (
                        <p className="cc6-metric-label mt-1" title={`Leads ativas neste projeto (${projectLoad}) divididas pelo peso do corretor (${state.weight})`}>
                          no projeto · pond. <span className="cc6-num">{Math.round((projectLoad / state.weight) * 10) / 10}</span>
                        </p>
                      ) : (
                        <p className="cc6-metric-label mt-1" title="Leads ativas deste corretor neste projeto. Sem peso cadastrado, a fila não pondera.">
                          no projeto
                        </p>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
          <p className="cc6-hairline px-5 py-2.5 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
            Somente corretores online, disponíveis e elegíveis no projeto · ordem por carga ponderada e última atribuição, a mesma do motor.
          </p>
        </div>

        <div className="cc6-panel-quiet cc6-reveal self-start p-4" style={{ animationDelay: "180ms" }} aria-labelledby="distribution-managers-title">
          <p className="cc6-eyebrow">Fase 35 · Liderança ao vivo</p>
          <h2 id="distribution-managers-title" className="mt-1 text-sm font-semibold tracking-tight text-[var(--atlas-texto-forte)]">Gerentes online</h2>
          <div className="mt-2 flex flex-col" aria-busy={loading}>
            {loading ? (
              <AtlasSkeleton className="h-24" />
            ) : managers.length === 0 ? (
              <div className="py-2">
                <AtlasEmpty
                  reason="no-activity"
                  eyebrow="Liderança offline"
                  title="Nenhum gerente direto online"
                  description="As regras automáticas seguem protegendo a fila."
                />
              </div>
            ) : (
              managers.map((manager, index) => {
                const teamOnline = brokers.filter((broker) => broker.reports_to === manager.id).length;
                return (
                  <div key={manager.id} className={`flex items-baseline justify-between gap-3 py-2.5 ${index ? "cc6-hairline" : ""}`}>
                    <span className="min-w-0 truncate text-xs font-medium text-[var(--atlas-texto-forte)]">{manager.full_name || "Gestor comercial"}</span>
                    <span className="cc6-num shrink-0 text-rotulo text-[var(--atlas-texto-fraco)]">
                      <span className={teamOnline ? "cc6-ok" : ""}>{teamOnline}</span> disponíve{teamOnline === 1 ? "l" : "is"} no time
                    </span>
                  </div>
                );
              })
            )}
          </div>
          <p className="cc6-hairline mt-1 pt-2.5 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
            Na superintendência aparecem somente os gerentes diretamente subordinados.
          </p>
        </div>
      </section>

      {/**
        * QUEM ENTRA NA FILA — e o painel morto que ficava aqui.
        *
        * Até 2026-08-03 este lugar tinha "Elegibilidade do time neste
        * empreendimento": um seletor de peso de 1 a 10 e um botão Pausar/Ativar
        * por corretor. Os três controles mandavam `action: "configure_member"`
        * para `/api/v1/crm/distribution`, que NÃO conhece essa ação — a rota
        * caía no `DISTRIBUTION_ACTION_INVALID` e devolvia 400 a cada clique.
        * O `queue` que alimentava a tela também era sintético: a rota montava
        * `enabled: true, weight: 1` para todo par corretor×projeto, então
        * "Pausado" nunca aparecia e o peso mostrado nunca vinha de lugar nenhum
        * (`project_distribution_members` tem zero linhas nesta base).
        *
        * Não é remoção de código que funcionava: é a troca de três controles
        * que erravam por controles que gravam. Peso saiu de propósito — a fila
        * agora é rodízio, e peso dentro de um rodízio é a contradição de
        * "cada um na sua vez".
        *
        * O escopo aqui é o do EMPREENDIMENTO DA LEAD (`developments`), não o do
        * seletor de projeto do topo desta página (`crm_projects`) — são tabelas
        * diferentes, com ids diferentes, para os mesmos quatro empreendimentos.
        * Por isso o painel traz o próprio seletor em vez de herdar o de cima:
        * herdar casaria id de uma tabela com fila da outra e não acharia nada,
        * em silêncio.
        */}
      <section aria-label="Fila de atendimento por empreendimento e por campanha">
        <div className="cc6-reveal" style={{ animationDelay: "300ms" }}>
          <FilaDeAtendimentoPanel podeEditar={data?.viewer.role !== "broker"} />
        </div>
      </section>

      {data?.viewer.role === "manager" ? (
        <section data-phase="57-distribution-priority">
          <div className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "340ms" }} aria-labelledby="distribution-priority-title">
            <PanelHead
              titulo="Prioridade por SLA e origem"
              fase="Fase 57 · Ordem inteligente da fila"
              id="distribution-priority-title"
              nota="Ordem: maior pressão de SLA → prioridade da origem → lead mais antiga. Nome, renda, gênero, idade e qualquer outro dado pessoal nunca entram na decisão."
            />
            <div className="cc6-hairline grid gap-4 p-5 lg:grid-cols-5">
              <label className={LABEL_CLASS}>
                Origem
                <select
                  value={prioritySource}
                  onChange={(event)=>{const source=event.target.value;setPrioritySource(source);const current=data.priorityRules.find((rule)=>rule.development_id===projectId&&rule.source_key===source);if(current){setSourcePriority(current.priority);setSourceSlaMinutes(current.sla_minutes)}}}
                  className={FIELD_CLASS}
                >
                  <option value="">Selecione</option>
                  {data.leadSources.map((source)=><option key={source} value={source}>{source}</option>)}
                </select>
              </label>
              <label className={LABEL_CLASS}>
                Prioridade 1–10
                <input type="number" min={1} max={10} value={sourcePriority} onChange={(event)=>setSourcePriority(Number(event.target.value))} className={FIELD_CLASS} />
              </label>
              <label className={LABEL_CLASS}>
                SLA em minutos
                <input type="number" min={5} max={10080} value={sourceSlaMinutes} onChange={(event)=>setSourceSlaMinutes(Number(event.target.value))} className={FIELD_CLASS} />
              </label>
              <label className={`${LABEL_CLASS} lg:col-span-2`}>
                Motivo auditável
                <input value={priorityReason} onChange={(event)=>setPriorityReason(event.target.value)} minLength={10} maxLength={500} placeholder="Ex.: origem com compromisso de contato em 15 minutos" className={FIELD_CLASS} />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-5">
                <div className="flex min-w-0 flex-wrap gap-1.5">
                  {data.priorityRules.filter((rule)=>rule.development_id===projectId&&rule.enabled).slice(0,8).map((rule)=>(
                    <span key={rule.source_key} className="cc6-chip">{rule.source_key} · P{rule.priority} · {rule.sla_minutes} min</span>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={working||!projectId||!prioritySource||priorityReason.trim().length<10}
                  onClick={()=>void configurePriority()}
                  className="atlas-button-primary disabled:opacity-50"
                >
                  {working?"Salvando...":"Salvar prioridade"}
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {data?.viewer.role === "manager" ? (
        <section data-phase="56-broker-capacity">
          <div className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "380ms" }} aria-labelledby="distribution-capacity-title">
            <PanelHead
              titulo="Limites de carteira por corretor"
              fase="Fase 56 · Proteção contra sobrecarga"
              id="distribution-capacity-title"
              nota="Capacidade operacional, não meta nem ranking. Sem comparação pública entre corretores: o limite protege o atendimento, não classifica gente. No teto, o banco bloqueia novas distribuições e transferências."
            />
            <div className="cc6-hairline grid gap-4 p-5 lg:grid-cols-5">
              <label className={LABEL_CLASS}>
                Corretor
                <select
                  value={capacityBrokerId}
                  onChange={(event)=>{const id=event.target.value;setCapacityBrokerId(id);const current=capacityMap.get(id);if(current){setMaxActiveLeads(current.max_active_leads);setMaxProjectLeads(current.max_project_leads);setWarningPercent(current.warning_percent)}}}
                  className={FIELD_CLASS}
                >
                  <option value="">Selecione</option>
                  {teamBrokers.map((broker)=><option key={broker.id} value={broker.id}>{broker.full_name||"Corretor"}</option>)}
                </select>
              </label>
              <label className={LABEL_CLASS}>
                Máximo ativo
                <input type="number" min={1} max={2000} value={maxActiveLeads} onChange={(event)=>setMaxActiveLeads(Number(event.target.value))} className={FIELD_CLASS} />
              </label>
              <label className={LABEL_CLASS}>
                Máximo por projeto
                <input type="number" min={1} max={1000} value={maxProjectLeads} onChange={(event)=>setMaxProjectLeads(Number(event.target.value))} className={FIELD_CLASS} />
              </label>
              <label className={LABEL_CLASS}>
                Avisar em %
                <input type="number" min={50} max={95} value={warningPercent} onChange={(event)=>setWarningPercent(Number(event.target.value))} className={FIELD_CLASS} />
              </label>
              <label className={LABEL_CLASS}>
                Motivo auditável
                <input value={capacityReason} onChange={(event)=>setCapacityReason(event.target.value)} minLength={10} maxLength={500} placeholder="Ex.: capacidade definida para o período" className={FIELD_CLASS} />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-5">
                <p className="min-w-0 text-xs leading-5 text-[var(--atlas-texto-fraco)]">
                  Carga atual <strong className="cc6-num text-[var(--atlas-texto-forte)]">{capacityBrokerId ? loadMap.get(capacityBrokerId)?.total ?? 0 : "—"}</strong> · alerta em {warningPercent}% e bloqueio real no teto · reduzir o limite não retira leads existentes.
                </p>
                <button
                  type="button"
                  disabled={working||!capacityBrokerId||capacityReason.trim().length<10||maxProjectLeads>maxActiveLeads}
                  onClick={()=>void configureCapacity()}
                  className="atlas-button-primary disabled:opacity-50"
                >
                  {working?"Salvando...":"Salvar limites"}
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {data?.viewer.role === "manager" ? (
        <section data-phase="55-absence-redistribution">
          <div className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "420ms" }} aria-labelledby="distribution-absence-title">
            <PanelHead
              titulo="Cobertura por ausência"
              fase="Fase 55 · Continuidade de atendimento"
              id="distribution-absence-title"
              nota="Não é acionado por simples queda de conexão — exige confirmação humana, com período de ausência e motivo registrados."
            />
            <div className="cc6-hairline grid gap-4 p-5 lg:grid-cols-4">
              <label className={LABEL_CLASS}>
                Corretor ausente
                <select value={absenceBrokerId} onChange={(event)=>setAbsenceBrokerId(event.target.value)} className={FIELD_CLASS}>
                  <option value="">Selecione</option>
                  {teamBrokers.map((broker)=><option key={broker.id} value={broker.id}>{broker.full_name||"Corretor"}</option>)}
                </select>
              </label>
              <label className={LABEL_CLASS}>
                Retorno previsto
                <input type="datetime-local" value={absenceEndsAt} onChange={(event)=>setAbsenceEndsAt(event.target.value)} className={FIELD_CLASS} />
              </label>
              <label className={`${LABEL_CLASS} lg:col-span-2`}>
                Motivo auditável
                <input value={absenceReason} onChange={(event)=>setAbsenceReason(event.target.value)} minLength={10} maxLength={500} placeholder="Ex.: férias programadas até o retorno informado" className={FIELD_CLASS} />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-4">
                <p className="min-w-0 max-w-3xl text-xs leading-5 text-[var(--atlas-texto-fraco)]">
                  Move somente a carteira ativa para corretores online da mesma equipe — responsável único, timeline, tarefas abertas e evidência do lote preservados; vendas e descartes intactos.
                </p>
                <button
                  type="button"
                  disabled={working||!absenceBrokerId||!absenceEndsAt||absenceReason.trim().length<10}
                  onClick={()=>void coverAbsence()}
                  className="atlas-button-primary disabled:opacity-50"
                >
                  {working?"Protegendo carteira...":"Ativar cobertura"}
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}
      {/**
        * AUDITORIA POR ÚLTIMO — os dois livros desceram de cima dos comandos.
        *
        * "Por que cada lead foi atribuída" e o "Histórico gerencial unificado"
        * estavam em 8º e 9º lugar, ACIMA de elegibilidade, prioridade,
        * capacidade e cobertura de ausência — ou seja, o que já aconteceu vinha
        * antes do que muda o que vai acontecer. Pela régua, o que audita é o
        * último degrau: desce inteiro, com os mesmos eventos, os mesmos chips e
        * as mesmas promessas de privacidade na tela.
        *
        * Continuam abertos e completos; só deixaram de gastar a dobra de quem
        * abriu esta tela para distribuir lead.
        */}
      {/* A cascata do `cc6-reveal` acompanha a nova posição: 220ms num painel
          que agora é o penúltimo faria o rodapé da tela aparecer ANTES do meio
          dela. O atraso é ordem de leitura, não decoração. */}
      <div className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "460ms" }} aria-labelledby="distribution-evidence-title">
        {/* A conta “12 ÷ 1 = 12” na ponta direita de cada linha era três números
            sem uma única palavra ao lado: o que eles significam vivia só no
            `title`, que não existe no toque e não existe na leitura de tela.
            A legenda sobe para o cabeçalho, dita UMA vez para as oito linhas,
            em vez de repetida em cada uma — e o `title` de cada linha fica onde
            está, porque nada aqui é removido. */}
        <PanelHead
          titulo="Por que cada lead foi atribuída"
          fase="Fase 51 · Evidência de distribuição"
          id="distribution-evidence-title"
          nota="Na ponta de cada linha: carga anterior no projeto ÷ peso do corretor = carga ponderada no instante da escolha."
        >
          <span className="cc6-chip" title="Cada evento preserva projeto, responsável único, carga anterior, peso e algoritmo usado.">responsável único</span>
        </PanelHead>
        {data?.recentAssignments.filter((item) => !projectId || item.development_id === projectId).length ? (
          data.recentAssignments.filter((item) => !projectId || item.development_id === projectId).slice(0, 8).map((item, index) => {
            const broker = profilesMap.get(item.assigned_to);
            return (
              <article key={item.id} className="cc6-reveal cc6-hairline flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3" style={{ animationDelay: `${480 + Math.min(index, 8) * 45}ms` }}>
                <strong className="text-sm font-semibold text-[var(--atlas-texto-forte)]">{broker?.full_name || "Corretor"}</strong>
                <span className="cc6-num min-w-0 truncate text-xs text-[var(--atlas-texto-fraco)]">Lead {item.lead_id.slice(0, 8)} · {new Date(item.created_at).toLocaleString("pt-BR")}</span>
                <span className="cc6-num ml-auto shrink-0 text-xs text-[var(--atlas-texto-medio)]" title="Carga anterior no projeto ÷ peso = carga ponderada no momento da escolha.">
                  {item.score_snapshot?.projectLoadBefore ?? "—"} ÷ {item.score_snapshot?.weight ?? 1} = {item.score_snapshot?.weightedLoadBefore ?? "—"}
                </span>
              </article>
            );
          })
        ) : (
          <div className="cc6-hairline px-5 py-4">
            <AtlasEmpty
              reason="no-activity"
              eyebrow="Sem atribuições recentes"
              title="Nenhuma atribuição registrada"
              description="As próximas distribuições terão justificativa auditável."
            />
          </div>
        )}
      </div>

      {data?.portfolioAudit ? (
        <section data-phase="59-portfolio-audit">
          <div className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "500ms" }} aria-labelledby="distribution-audit-title">
            <PanelHead titulo="Histórico gerencial unificado" fase="Fase 59 · Livro da carteira" id="distribution-audit-title">
              {/* A promessa de privacidade deste livro precisa estar NA TELA, e
                  não só no contrato: quem lê um histórico gerencial tem que
                  saber, olhando, que ali não há nome, telefone, e-mail nem
                  texto livre da lead — só metadado de movimentação. */}
              <span className="cc6-chip" title="Nome, telefone, e-mail e textos livres da lead não são expostos neste livro.">SEM PII</span>
              <span className="cc6-chip">até {data.portfolioAudit.maximum} eventos</span>
            </PanelHead>
            <div className="flex flex-wrap gap-1.5 px-5 pb-3" aria-label="Resumo por tipo de movimento">
              {([["Distribuições", data.portfolioAudit.summary.distributions], ["Transferências", data.portfolioAudit.summary.transfers], ["Reservas", data.portfolioAudit.summary.reservations], ["Devoluções", data.portfolioAudit.summary.returns], ["Ausências", data.portfolioAudit.summary.absences], ["Capacidade", data.portfolioAudit.summary.capacityChanges]] as const).map(([label, value]) => (
                <span key={label} className="cc6-chip">
                  {label} <strong className="font-semibold text-[var(--atlas-texto-forte)]">{value}</strong>
                </span>
              ))}
            </div>
            {data.portfolioAudit.events.length ? (
              data.portfolioAudit.events.slice(0, 20).map((event, index) => (
                <article key={`${event.eventType}-${event.occurredAt}-${index}`} className="cc6-hairline flex items-baseline gap-3 px-5 py-2.5">
                  <strong className="shrink-0 text-xs font-medium text-[var(--atlas-texto-forte)]">{AUDIT_EVENT_LABELS[event.eventType] || event.eventType}</strong>
                  <span className="min-w-0 flex-1 truncate text-xs text-[var(--atlas-texto-fraco)]">
                    {event.brokerId ? profilesMap.get(event.brokerId)?.full_name || "Corretor no escopo" : "Operação gerencial"}
                    {event.leadId ? ` · Lead ${event.leadId.slice(0, 8)}` : ""}
                  </span>
                  <time className="cc6-num shrink-0 text-rotulo text-[var(--atlas-texto-fraco)]">{new Date(event.occurredAt).toLocaleString("pt-BR")}</time>
                </article>
              ))
            ) : (
              <div className="cc6-hairline px-5 py-4">
                <AtlasEmpty
                  reason="no-activity"
                  eyebrow="Livro da carteira vazio"
                  title="Histórico ainda vazio"
                  description="Os próximos movimentos aparecem aqui com rastreabilidade."
                />
              </div>
            )}
            <p className="cc6-hairline px-5 py-2.5 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
              Escopo hierárquico · fontes operacionais preservadas · nome, telefone, e-mail e textos livres da lead não expostos.
            </p>
          </div>
        </section>
      ) : null}

    </div>
  );
}
