"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  BellRing,
  Bot,
  BrainCircuit,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Command,
  Gauge,
  Headphones,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  MessageCircleMore,
  Radio,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserRoundCheck,
  UsersRound,
  Zap,
} from "lucide-react";
import styles from "./command-center-concepts.module.css";

type ConceptId = "pulse" | "mission" | "revenue" | "flow" | "adaptive";
type Concept = {
  id: ConceptId;
  number: string;
  name: string;
  promise: string;
  bestFor: string;
  accent: string;
};

const concepts: Concept[] = [
  { id: "pulse", number: "01", name: "Pulse Executivo", promise: "Decidir em 30 segundos", bestFor: "Diretor e liderança", accent: "Ciano" },
  { id: "mission", number: "02", name: "Mission Control", promise: "Operar em tempo real", bestFor: "Gerente e distribuição", accent: "Verde" },
  { id: "revenue", number: "03", name: "Revenue Radar", promise: "Conectar mídia à venda", bestFor: "Diretoria e marketing", accent: "Violeta" },
  { id: "flow", number: "04", name: "Broker Flow", promise: "Executar sem distração", bestFor: "Corretor e rotina", accent: "Azul" },
  { id: "adaptive", number: "05", name: "Adaptive AI", promise: "IA monta a visão", bestFor: "Experiência premium", accent: "Âmbar" },
];

const metrics = [
  { label: "Leads hoje", value: "86", delta: "+14%", icon: UsersRound, tone: "blue" },
  { label: "Precisam de ação", value: "17", delta: "5 urgentes", icon: Zap, tone: "amber" },
  { label: "Pipeline", value: "R$ 18,6 mi", delta: "+8,4%", icon: CircleDollarSign, tone: "green" },
  { label: "Conversão", value: "4,8%", delta: "+0,7 p.p.", icon: TrendingUp, tone: "violet" },
];

const priorities = [
  { name: "Mariana Souza", detail: "Inside Perdizes · proposta visualizada", score: 92, action: "Ligar agora", time: "há 8 min", tone: "hot" },
  { name: "Carlos Nunes", detail: "Arvo Paraíso · visita sem retorno", score: 86, action: "Confirmar interesse", time: "há 2 h", tone: "warm" },
  { name: "Juliana Costa", detail: "Spin Mood · financiamento aprovado", score: 81, action: "Enviar unidades", time: "hoje", tone: "ready" },
];

const stages = [
  { label: "Novos", count: 86, value: "R$ 9,4 mi", width: "84%" },
  { label: "Qualificados", count: 42, value: "R$ 7,1 mi", width: "64%" },
  { label: "Visitas", count: 18, value: "R$ 4,8 mi", width: "43%" },
  { label: "Propostas", count: 9, value: "R$ 2,7 mi", width: "28%" },
];

function IconBadge({ children, tone = "blue" }: { children: ReactNode; tone?: string }) {
  return <span className={styles.iconBadge} data-tone={tone}>{children}</span>;
}

function MetricStrip({ compact = false }: { compact?: boolean }) {
  return (
    <div className={styles.metricStrip} data-compact={compact ? "true" : "false"}>
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <article className={styles.metric} key={metric.label}>
            <IconBadge tone={metric.tone}><Icon size={16} /></IconBadge>
            <div><span>{metric.label}</span><strong>{metric.value}</strong></div>
            <small data-positive={!metric.delta.includes("urgentes")}>{metric.delta}</small>
          </article>
        );
      })}
    </div>
  );
}

function PriorityList({ title = "Onde agir agora", limit = 3 }: { title?: string; limit?: number }) {
  return (
    <section className={styles.panel}>
      <header className={styles.panelHeader}>
        <div><span className={styles.eyebrow}>PRIORIDADE EXPLICÁVEL</span><h3>{title}</h3></div>
        <button type="button" className={styles.textButton}>Ver fila <ArrowRight size={14} /></button>
      </header>
      <div className={styles.priorityList}>
        {priorities.slice(0, limit).map((lead, index) => (
          <article className={styles.priorityRow} key={lead.name}>
            <span className={styles.priorityIndex}>0{index + 1}</span>
            <div className={styles.priorityLead}><strong>{lead.name}</strong><span>{lead.detail}</span></div>
            <span className={styles.score} data-tone={lead.tone}>{lead.score}</span>
            <span className={styles.priorityTime}>{lead.time}</span>
            <button type="button" className={styles.rowAction}>{lead.action}<ChevronRight size={14} /></button>
          </article>
        ))}
      </div>
    </section>
  );
}

function FunnelPanel({ title = "Funil em movimento" }: { title?: string }) {
  return (
    <section className={styles.panel}>
      <header className={styles.panelHeader}>
        <div><span className={styles.eyebrow}>VELOCIDADE COMERCIAL</span><h3>{title}</h3></div>
        <span className={styles.liveBadge}><Radio size={12} /> ao vivo</span>
      </header>
      <div className={styles.funnelList}>
        {stages.map((stage) => (
          <div className={styles.funnelRow} key={stage.label}>
            <span>{stage.label}</span><strong>{stage.count}</strong>
            <div className={styles.funnelTrack}><span style={{ width: stage.width }} /></div>
            <small>{stage.value}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function AIBrief({ mode = "executive" }: { mode?: "executive" | "operational" | "broker" | "marketing" }) {
  const copy = {
    executive: ["A conversão subiu, mas 17 oportunidades podem esfriar nas próximas 24 horas.", "Direcione a equipe primeiro para Inside Perdizes; há R$ 2,4 mi em propostas com sinal recente."],
    operational: ["Diego e Luciano estão com capacidade. A fila tem 11 leads de Inside Perdizes sem responsável.", "Aprovar a sugestão equilibra a carga sem transferir nenhuma carteira existente."],
    broker: ["Seu melhor próximo passo é ligar para Mariana; ela abriu a proposta duas vezes hoje.", "Depois, confirme a visita de Carlos e envie a tabela atualizada para Juliana."],
    marketing: ["Campanha Inside | Investidor gera mais propostas, não apenas mais leads.", "Mantenha orçamento e corrija o atraso no envio de eventos de visita para a Meta."],
  }[mode];
  return (
    <section className={styles.aiBrief}>
      <div className={styles.aiOrb}><BrainCircuit size={22} /></div>
      <div><span className={styles.eyebrow}>ATLAS ONE · LEITURA PROATIVA</span><h3>{copy[0]}</h3><p>{copy[1]}</p></div>
      <button type="button" className={styles.primaryAction}>Executar plano <ArrowRight size={15} /></button>
    </section>
  );
}

function ConceptHeader({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy: string; action: string }) {
  return (
    <header className={styles.conceptHeader}>
      <div><span className={styles.eyebrow}>{eyebrow}</span><h2>{title}</h2><p>{copy}</p></div>
      <div className={styles.headerActions}><span className={styles.liveBadge}><span className={styles.pulseDot} />Dados demonstrativos</span><button type="button" className={styles.primaryAction}>{action}<ArrowRight size={15} /></button></div>
    </header>
  );
}

function PulseExecutive() {
  return (
    <div className={styles.concept} data-concept="pulse">
      <ConceptHeader eyebrow="MODELO 01 · PULSE EXECUTIVO" title="A operação em uma decisão." copy="Uma leitura limpa para o diretor entender resultado, risco e próxima ação em menos de 30 segundos." action="Abrir decisão do dia" />
      <AIBrief mode="executive" />
      <MetricStrip />
      <div className={styles.twoColumns}><PriorityList /><FunnelPanel title="Receita por etapa" /></div>
      <div className={styles.signalBar}>
        <div><Target size={17} /><span><strong>Meta da semana</strong> 68% atingida</span></div>
        <div><ShieldCheck size={17} /><span><strong>Operação saudável</strong> 2 alertas sob controle</span></div>
        <div><Megaphone size={17} /><span><strong>Melhor campanha</strong> Inside | Investidor</span></div>
      </div>
    </div>
  );
}

function MissionControl() {
  const brokers = [
    { name: "Diego", state: "Disponível", load: 62, leads: 7 },
    { name: "Luciano", state: "Disponível", load: 48, leads: 5 },
    { name: "Adolfo", state: "Em atendimento", load: 84, leads: 11 },
  ];
  return (
    <div className={styles.concept} data-concept="mission">
      <ConceptHeader eyebrow="MODELO 02 · MISSION CONTROL" title="Tudo que muda, no momento em que muda." copy="Sala operacional para gerente: fila, capacidade, SLA e intervenções em uma única superfície ao vivo." action="Resolver 5 alertas" />
      <div className={styles.missionGrid}>
        <section className={styles.radarPanel}>
          <div className={styles.radar}><span /><span /><span /><i /></div>
          <div className={styles.radarCopy}><span className={styles.eyebrow}>PULSO EM TEMPO REAL</span><strong>23 eventos</strong><p>nos últimos 15 minutos</p></div>
          <div className={styles.liveEvents}>
            <span><MessageCircleMore size={14} /> Lead respondeu <time>agora</time></span>
            <span><UserRoundCheck size={14} /> Lead distribuído <time>2 min</time></span>
            <span><CalendarClock size={14} /> Visita confirmada <time>5 min</time></span>
          </div>
        </section>
        <section className={styles.panel}>
          <header className={styles.panelHeader}><div><span className={styles.eyebrow}>CAPACIDADE DA EQUIPE</span><h3>Roleta pronta para operar</h3></div><span className={styles.statusOk}>3 online</span></header>
          <div className={styles.brokerList}>{brokers.map((broker) => <div className={styles.brokerRow} key={broker.name}><span className={styles.avatar}>{broker.name[0]}</span><div><strong>{broker.name}</strong><small>{broker.state}</small></div><div className={styles.loadTrack}><span style={{ width: `${broker.load}%` }} /></div><b>{broker.leads}</b></div>)}</div>
          <button type="button" className={styles.wideAction}>Revisar distribuição de 11 leads <ArrowRight size={15} /></button>
        </section>
      </div>
      <MetricStrip compact />
      <div className={styles.twoColumns}><PriorityList title="Intervenções do gerente" limit={2} /><AIBrief mode="operational" /></div>
    </div>
  );
}

function RevenueRadar() {
  const campaigns = [
    { name: "Inside | Investidor", spend: "R$ 12,4 mil", leads: 184, sales: 4, roas: "8,2×", health: 92 },
    { name: "Arvo | Moradia", spend: "R$ 8,1 mil", leads: 121, sales: 2, roas: "5,7×", health: 78 },
    { name: "Spin | Remarketing", spend: "R$ 4,6 mil", leads: 53, sales: 1, roas: "4,1×", health: 64 },
  ];
  return (
    <div className={styles.concept} data-concept="revenue">
      <ConceptHeader eyebrow="MODELO 03 · REVENUE RADAR" title="Do clique à venda, sem achismo." copy="Visão de receita para o diretor acompanhar campanhas, Meta/CAPI, conversão e resultado por incorporadora." action="Ver plano de mídia" />
      <AIBrief mode="marketing" />
      <div className={styles.revenueStats}>
        <article><span>Investimento</span><strong>R$ 25,1 mil</strong><small>últimos 30 dias</small></article>
        <article><span>Receita atribuída</span><strong>R$ 1,48 mi</strong><small>7 vendas confirmadas</small></article>
        <article><span>ROAS real</span><strong>6,4×</strong><small>receita ÷ mídia</small></article>
        <article><span>Qualidade CAPI</span><strong>88%</strong><small>eventos aproveitáveis</small></article>
      </div>
      <section className={styles.panel}>
        <header className={styles.panelHeader}><div><span className={styles.eyebrow}>RANKING POR RECEITA REAL</span><h3>Campanhas que geram compradores</h3></div><button type="button" className={styles.textButton}>Abrir atribuição <ArrowRight size={14} /></button></header>
        <div className={styles.campaignTable}>
          <div className={styles.tableHeader}><span>Campanha</span><span>Investimento</span><span>Leads</span><span>Vendas</span><span>ROAS</span><span>Saúde</span></div>
          {campaigns.map((campaign) => <div className={styles.tableRow} key={campaign.name}><strong>{campaign.name}</strong><span>{campaign.spend}</span><span>{campaign.leads}</span><span>{campaign.sales}</span><b>{campaign.roas}</b><div className={styles.healthTrack}><span style={{ width: `${campaign.health}%` }} /></div></div>)}
        </div>
      </section>
      <div className={styles.threeColumns}>
        <div className={styles.miniInsight}><Megaphone size={18} /><div><strong>Criativo vencedor</strong><span>Tour de 45s · 3,2× mais visitas</span></div></div>
        <div className={styles.miniInsight}><RefreshCw size={18} /><div><strong>Loop Meta ativo</strong><span>Visita, proposta e venda enviados</span></div></div>
        <div className={styles.miniInsight}><BellRing size={18} /><div><strong>1 sinal atrasado</strong><span>Corrigir evento de qualificação</span></div></div>
      </div>
    </div>
  );
}

function BrokerFlow() {
  const day = [
    { time: "09:30", label: "Ligar para Mariana", meta: "Alta chance · abriu proposta", icon: Headphones, done: false },
    { time: "10:15", label: "Confirmar visita de Carlos", meta: "Inside Perdizes · sábado", icon: CalendarClock, done: false },
    { time: "11:00", label: "Enviar tabela para Juliana", meta: "Unidades 1203 e 1405", icon: MessageCircleMore, done: false },
    { time: "14:00", label: "Follow-up concluído", meta: "Resultado registrado", icon: Check, done: true },
  ];
  return (
    <div className={styles.concept} data-concept="flow">
      <ConceptHeader eyebrow="MODELO 04 · BROKER FLOW" title="Uma ação de cada vez. A certa." copy="Experiência simples para o corretor começar o dia sabendo quem atender, por quê e o que fazer depois." action="Começar meu dia" />
      <div className={styles.flowHero}>
        <AIBrief mode="broker" />
        <aside className={styles.focusScore}><Gauge size={24} /><span>Ritmo de hoje</span><strong>76</strong><small>3 de 7 ações concluídas</small><div><i style={{ width: "43%" }} /></div></aside>
      </div>
      <div className={styles.flowGrid}>
        <section className={styles.panel}>
          <header className={styles.panelHeader}><div><span className={styles.eyebrow}>ROTEIRO DO DIA</span><h3>Próximas ações</h3></div><span className={styles.liveBadge}>4 prioridades</span></header>
          <div className={styles.dayList}>{day.map((item) => { const Icon = item.icon; return <article className={styles.dayRow} data-done={item.done} key={item.time}><time>{item.time}</time><IconBadge tone={item.done ? "green" : "blue"}><Icon size={15} /></IconBadge><div><strong>{item.label}</strong><span>{item.meta}</span></div><button type="button">{item.done ? "Feito" : "Executar"}</button></article>; })}</div>
        </section>
        <div className={styles.flowSide}>
          <section className={styles.panel}><span className={styles.eyebrow}>MEU RESULTADO</span><div className={styles.personalStats}><div><strong>18</strong><span>leads ativos</span></div><div><strong>4</strong><span>quentes</span></div><div><strong>2</strong><span>visitas</span></div></div></section>
          <PriorityList title="Depois do roteiro" limit={2} />
        </div>
      </div>
    </div>
  );
}

function AdaptiveAI() {
  const [focus, setFocus] = useState<"today" | "team" | "marketing">("today");
  return (
    <div className={styles.concept} data-concept="adaptive">
      <ConceptHeader eyebrow="MODELO 05 · ADAPTIVE AI" title="A sala se adapta à decisão." copy="A IA reduz o painel e traz somente os blocos necessários para o objetivo escolhido naquele momento." action="Montar visão com IA" />
      <div className={styles.intentBar}><span>Quero decidir sobre</span>{[{ id: "today", label: "Hoje", icon: Clock3 }, { id: "team", label: "Equipe", icon: UsersRound }, { id: "marketing", label: "Campanhas", icon: Megaphone }].map((item) => { const Icon = item.icon; return <button type="button" data-active={focus === item.id} onClick={() => setFocus(item.id as typeof focus)} key={item.id}><Icon size={15} />{item.label}</button>; })}<small><Sparkles size={13} /> painel reorganizado em tempo real</small></div>
      <section className={styles.adaptiveHero}>
        <div className={styles.aiMonogram}><Bot size={30} /></div>
        <div><span className={styles.eyebrow}>BRIEFING ADAPTATIVO</span><h3>{focus === "today" ? "Proteja R$ 2,4 mi em propostas hoje." : focus === "team" ? "Equilibre 11 leads entre dois corretores disponíveis." : "Priorize receita: Inside entrega o melhor ROAS real."}</h3><p>{focus === "today" ? "São cinco contatos com intenção recente. A sequência já considera urgência, valor e último comportamento." : focus === "team" ? "A recomendação usa projeto, capacidade e tempo de resposta. Nenhuma carteira será alterada sem aprovação." : "O volume caiu 6%, mas a qualidade subiu. Evite cortar orçamento antes de concluir a janela de atribuição."}</p></div>
        <button type="button" className={styles.primaryAction}>Aplicar recomendação <ArrowRight size={15} /></button>
      </section>
      {focus === "today" ? <><MetricStrip compact /><div className={styles.twoColumns}><PriorityList limit={2} /><FunnelPanel /></div></> : null}
      {focus === "team" ? <><div className={styles.adaptiveCards}><div><UsersRound /><strong>5 online</strong><span>2 com capacidade imediata</span></div><div><Clock3 /><strong>8 min</strong><span>tempo médio de resposta</span></div><div><ListChecks /><strong>11 leads</strong><span>aguardando distribuição</span></div></div><PriorityList title="Ações de liderança" limit={3} /></> : null}
      {focus === "marketing" ? <><div className={styles.adaptiveCards}><div><CircleDollarSign /><strong>6,4×</strong><span>ROAS real</span></div><div><Target /><strong>88%</strong><span>qualidade dos sinais</span></div><div><Rocket /><strong>+22%</strong><span>visitas qualificadas</span></div></div><AIBrief mode="marketing" /></> : null}
    </div>
  );
}

const renderConcept: Record<ConceptId, () => ReactNode> = {
  pulse: () => <PulseExecutive />,
  mission: () => <MissionControl />,
  revenue: () => <RevenueRadar />,
  flow: () => <BrokerFlow />,
  adaptive: () => <AdaptiveAI />,
};

export function CommandCenterConcepts() {
  const [active, setActive] = useState<ConceptId>("pulse");
  const [approved, setApproved] = useState<ConceptId | null>(null);
  const activeConcept = useMemo(() => concepts.find((concept) => concept.id === active)!, [active]);

  useEffect(() => {
    const saved = window.localStorage.getItem("atlas:command-center-concept");
    if (concepts.some((concept) => concept.id === saved)) setApproved(saved as ConceptId);
  }, []);

  function approve() {
    setApproved(active);
    window.localStorage.setItem("atlas:command-center-concept", active);
  }

  return (
    <div className={styles.lab}>
      <header className={styles.labHeader}>
        <div className={styles.labTitle}><span className={styles.labMark}><Command size={18} /></span><div><span>ATLAS ONE · DESIGN LAB</span><h1>Cinco caminhos para a nova Sala de Comando</h1><p>Compare a lógica de decisão de cada modelo. Esta área não altera a operação atual.</p></div></div>
        <div className={styles.labActions}><span className={styles.prototypeBadge}><ShieldCheck size={14} /> Protótipo isolado</span><button type="button" className={styles.approveButton} onClick={approve}>{approved === active ? <Check size={15} /> : <Sparkles size={15} />}{approved === active ? "Modelo escolhido" : "Escolher este caminho"}</button></div>
      </header>

      <nav className={styles.conceptNav} aria-label="Modelos da Sala de Comando">
        {concepts.map((concept) => <button type="button" data-active={active === concept.id} data-approved={approved === concept.id} onClick={() => setActive(concept.id)} key={concept.id}><span>{concept.number}</span><div><strong>{concept.name}</strong><small>{concept.promise}</small></div>{approved === concept.id ? <Check size={14} /> : null}</button>)}
      </nav>

      <div className={styles.conceptMeta}><span><LayoutDashboard size={14} />{activeConcept.bestFor}</span><span><Activity size={14} />{activeConcept.promise}</span><span><BarChart3 size={14} />Acento {activeConcept.accent}</span></div>
      <main className={styles.preview}>{renderConcept[active]()}</main>

      <section className={styles.comparison}>
        <header><span className={styles.eyebrow}>COMPARAÇÃO RÁPIDA</span><h2>Qual problema cada caminho resolve melhor?</h2></header>
        <div className={styles.comparisonGrid}>{concepts.map((concept) => <button type="button" onClick={() => setActive(concept.id)} data-active={active === concept.id} key={concept.id}><span>{concept.number}</span><strong>{concept.name}</strong><small>{concept.bestFor}</small><p>{concept.promise}</p><ArrowRight size={14} /></button>)}</div>
        <div className={styles.recommendation}><BrainCircuit size={20} /><div><strong>Recomendação de produto</strong><p>Use o <b>Pulse Executivo</b> como base, a operação ao vivo do <b>Mission Control</b> e a personalização do <b>Adaptive AI</b>. Assim o Atlas One fica decisivo sem perder profundidade.</p></div></div>
      </section>
    </div>
  );
}
