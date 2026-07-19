import Image from "next/image";
import Link from "next/link";

const capabilities = [
  { index: "01", title: "Mais conversão", detail: "Priorize oportunidades e reduza leads perdidos no funil." },
  { index: "02", title: "Receita rastreável", detail: "Conecte campanha, atendimento, visita e venda ao ROI real." },
  { index: "03", title: "Gestão previsível", detail: "Antecipe gargalos, proteja SLAs e acompanhe o forecast comercial." },
];

const operatingSignals = ["Leads", "Pipeline", "Projetos", "Campanhas", "Inteligência"];
const journey = ["Captura", "Qualificação", "Atendimento", "Visita", "Proposta", "Venda"];
const roleViews = [
  { role: "Diretoria", focus: "Decisão", detail: "Operação, receita, campanhas e riscos em uma visão executiva." },
  { role: "Gestão", focus: "Ritmo", detail: "Equipe, distribuição, SLA e gargalos para agir todos os dias." },
  { role: "Corretor", focus: "Conversão", detail: "Prioridades, contexto e próxima ação para cada cliente." },
];

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#020508] text-white selection:bg-sky-300 selection:text-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_26%,rgba(14,165,233,.12),transparent_28rem),radial-gradient(circle_at_10%_90%,rgba(37,99,235,.08),transparent_32rem)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/60 to-transparent" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-5 sm:px-8 lg:px-12">
        <header className="flex h-24 items-center justify-between border-b border-white/[.07]">
          <Link href="/" className="group flex items-center gap-3" aria-label="Atlas AI — início">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-sky-300/20 bg-sky-300/[.07] text-sm font-black text-sky-200 transition group-hover:border-sky-300/40">A</span>
            <div>
              <p className="text-lg font-black tracking-[-.04em]">ATLAS <span className="text-sky-400">AI</span></p>
              <p className="text-[8px] font-semibold uppercase tracking-[.24em] text-slate-500">Inteligência comercial imobiliária</p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 text-xs text-slate-500 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,.7)]" /> Operação conectada</span>
            <Link href="/login" className="rounded-full border border-white/10 bg-white/[.045] px-5 py-2.5 text-sm font-semibold transition hover:border-sky-300/25 hover:bg-sky-300/[.08]">Acessar plataforma</Link>
          </div>
        </header>

        <section className="grid flex-1 items-center gap-10 py-14 lg:grid-cols-[1.05fr_.95fr] lg:py-10">
          <div className="atlas-entrance-copy relative z-10 max-w-3xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-sky-300/15 bg-sky-300/[.05] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.2em] text-sky-200">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-300" /> Vendas imobiliárias com previsibilidade
            </div>

            <h1 className="max-w-[820px] text-[clamp(3.4rem,7vw,7.4rem)] font-semibold leading-[.88] tracking-[-.075em] text-white">
              Venda melhor.
              <span className="mt-2 block bg-gradient-to-r from-sky-200 via-sky-400 to-blue-600 bg-clip-text text-transparent">Decida antes.</span>
            </h1>

            <p className="mt-8 max-w-xl text-base leading-7 text-slate-400 sm:text-lg sm:leading-8">
              A plataforma de inteligência comercial que transforma leads em vendas previsíveis para incorporadoras e imobiliárias.
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Link href="/login" className="group inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-white px-7 text-sm font-bold !text-slate-950 transition hover:-translate-y-0.5 hover:bg-sky-100">
                Entrar no Atlas <span className="transition group-hover:translate-x-1" aria-hidden="true">→</span>
              </Link>
              <Link href="/forgot-password" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/10 px-7 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/[.04]">Recuperar acesso</Link>
            </div>

            <div className="mt-12 border-t border-white/[.07] pt-6">
              <p className="mb-4 text-[9px] font-bold uppercase tracking-[.22em] text-slate-600">Uma única fonte da verdade</p>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                {operatingSignals.map((signal) => <span key={signal} className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.16em] text-slate-500"><span className="h-1 w-1 rounded-full bg-sky-400" />{signal}</span>)}
              </div>
            </div>
          </div>

          <div className="atlas-entrance-visual relative mx-auto min-h-[500px] w-full max-w-[650px] lg:min-h-[700px]">
            <div className="absolute left-[8%] top-[10%] h-[68%] w-[84%] rounded-full bg-sky-400/[.08] blur-[100px]" />
            <div className="absolute inset-x-[5%] bottom-[14%] h-px bg-gradient-to-r from-transparent via-sky-300/60 to-transparent shadow-[0_0_40px_rgba(56,189,248,.45)]" />
            <div className="absolute inset-x-[8%] bottom-[14%] h-[38%] opacity-35 [background-image:linear-gradient(to_top,rgba(56,189,248,.35)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,.22)_1px,transparent_1px)] [background-size:100%_42px,52px_100%] [mask-image:linear-gradient(to_top,black,transparent)] [transform:perspective(500px)_rotateX(64deg)] [transform-origin:bottom]" />
            <div className="atlas-signal-line absolute left-[16%] right-[16%] top-[34%] h-px bg-gradient-to-r from-transparent via-sky-300/80 to-transparent shadow-[0_0_24px_rgba(56,189,248,.6)]" />

            <div className="absolute right-[8%] top-[9%] text-right">
              <p className="text-[9px] font-bold uppercase tracking-[.22em] text-slate-600">Spatial intelligence</p>
              <p className="mt-1 text-xs font-medium text-slate-400">Mercado · Produto · Cliente</p>
            </div>

            <div className="absolute left-0 top-[17%] z-20 rounded-2xl border border-white/[.09] bg-[#07101a]/80 px-4 py-3 backdrop-blur-xl">
              <p className="text-[9px] font-bold uppercase tracking-[.17em] text-slate-500">Signal</p>
              <p className="mt-1 text-sm font-semibold text-white">Próxima melhor ação</p>
            </div>
            <div className="absolute bottom-[23%] right-0 z-20 rounded-2xl border border-sky-300/[.13] bg-[#07101a]/80 px-4 py-3 backdrop-blur-xl">
              <p className="text-[9px] font-bold uppercase tracking-[.17em] text-sky-400">Atlas Brain</p>
              <p className="mt-1 text-sm font-semibold text-white">Contexto imobiliário ativo</p>
            </div>

            <Image src="/brand/atlas-robot-assistant.png" alt="Assistente de inteligência imobiliária Atlas" width={560} height={820} priority sizes="(max-width: 1024px) 75vw, 42vw" className="atlas-entrance-robot absolute bottom-[10%] left-1/2 z-10 h-[72%] w-auto object-contain opacity-90 drop-shadow-[0_40px_65px_rgba(14,165,233,.18)]" />
          </div>
        </section>

        <section className="relative z-20 grid gap-px overflow-hidden rounded-t-[28px] border border-b-0 border-white/[.08] bg-white/[.08] md:grid-cols-3">
          {capabilities.map((item) => (
            <article key={item.index} className="group bg-[#050a10]/95 p-6 transition hover:bg-[#07111b] sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <span className="text-[10px] font-bold tracking-[.2em] text-sky-400">{item.index}</span>
                <span className="text-slate-700 transition group-hover:translate-x-1 group-hover:text-sky-400" aria-hidden="true">↗</span>
              </div>
              <h2 className="mt-8 text-xl font-semibold tracking-[-.03em]">{item.title}</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">{item.detail}</p>
            </article>
          ))}
        </section>

        <section className="border-x border-white/[.08] bg-[#050a10]/95 px-5 py-20 sm:px-10 lg:px-14 lg:py-28">
          <div className="mx-auto max-w-6xl">
            <div className="grid items-end gap-8 lg:grid-cols-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.24em] text-sky-400">Do sinal à venda</p>
                <h2 className="mt-4 max-w-xl text-4xl font-semibold leading-[1.02] tracking-[-.055em] sm:text-5xl">Um fluxo contínuo.<br /><span className="text-slate-500">Nenhum contexto perdido.</span></h2>
              </div>
              <p className="max-w-lg text-sm leading-7 text-slate-500 lg:justify-self-end">Cada avanço comercial alimenta a próxima decisão. O Atlas mantém cliente, produto, atendimento e origem conectados do primeiro contato ao fechamento.</p>
            </div>

            <div className="mt-14 overflow-hidden rounded-[28px] border border-white/[.08] bg-[#03070b] p-5 sm:p-8">
              <div className="flex items-center justify-between gap-4 border-b border-white/[.07] pb-5">
                <div><p className="text-xs font-semibold text-white">Jornada comercial</p><p className="mt-1 text-[10px] uppercase tracking-[.18em] text-slate-600">Aprendizado conectado ao funil</p></div>
                <span className="rounded-full border border-emerald-400/15 bg-emerald-400/[.06] px-3 py-1 text-[9px] font-bold uppercase tracking-[.15em] text-emerald-300">Fluxo ativo</span>
              </div>
              <div className="relative mt-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <div className="absolute left-[7%] right-[7%] top-5 hidden h-px bg-gradient-to-r from-sky-400/20 via-sky-300/70 to-blue-500/20 lg:block" />
                {journey.map((stage, index) => <div key={stage} className="relative z-10 rounded-2xl border border-white/[.07] bg-white/[.025] p-4 lg:border-0 lg:bg-transparent lg:p-0 lg:text-center"><span className="inline-grid h-10 w-10 place-items-center rounded-full border border-sky-300/20 bg-[#07111b] text-[10px] font-bold text-sky-300">{String(index + 1).padStart(2, "0")}</span><p className="mt-3 text-xs font-semibold text-slate-300">{stage}</p></div>)}
              </div>
            </div>
          </div>
        </section>

        <section className="border-x border-t border-white/[.08] bg-[#03070b] px-5 py-20 sm:px-10 lg:px-14 lg:py-28">
          <div className="mx-auto grid max-w-6xl gap-14 lg:grid-cols-[.8fr_1.2fr] lg:items-center">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.24em] text-sky-400">Uma plataforma. Cada visão.</p>
              <h2 className="mt-4 text-4xl font-semibold leading-[1.03] tracking-[-.055em] sm:text-5xl">Clareza para quem decide. Foco para quem vende.</h2>
              <p className="mt-6 max-w-md text-sm leading-7 text-slate-500">O mesmo dado assume a forma certa para cada responsabilidade, sem quebrar a fonte única da verdade.</p>
            </div>

            <div className="grid gap-3">
              {roleViews.map((item, index) => (
                <article key={item.role} className="group grid gap-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-5 transition hover:border-sky-300/15 hover:bg-sky-300/[.035] sm:grid-cols-[110px_110px_1fr] sm:items-center">
                  <p className="text-[10px] font-bold uppercase tracking-[.17em] text-slate-500">{String(index + 1).padStart(2, "0")} · {item.role}</p>
                  <p className="text-lg font-semibold tracking-[-.03em] text-white">{item.focus}</p>
                  <p className="text-sm leading-6 text-slate-500">{item.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-b-[32px] border border-white/[.08] bg-gradient-to-br from-[#07121d] to-[#03070b] px-6 py-20 text-center sm:px-10 lg:py-28">
          <div className="pointer-events-none absolute left-1/2 top-0 h-56 w-96 -translate-x-1/2 rounded-full bg-sky-400/[.08] blur-[90px]" />
          <div className="relative mx-auto max-w-3xl">
              <p className="text-[10px] font-bold uppercase tracking-[.24em] text-sky-400">Atlas AI · O cérebro comercial imobiliário</p>
            <h2 className="mt-5 text-4xl font-semibold tracking-[-.055em] sm:text-6xl">Transforme leads em receita previsível.</h2>
            <p className="mx-auto mt-6 max-w-xl text-sm leading-7 text-slate-500">Entre no Command Center e saiba onde agir hoje para vender mais, com menos desperdício de mídia e tempo comercial.</p>
            <Link href="/login" className="group mt-9 inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-white px-8 text-sm font-bold !text-slate-950 transition hover:-translate-y-0.5 hover:bg-sky-100">Acessar o Atlas <span className="transition group-hover:translate-x-1" aria-hidden="true">→</span></Link>
          </div>
        </section>

        <footer className="flex flex-col items-center justify-between gap-3 py-8 text-[10px] uppercase tracking-[.16em] text-slate-700 sm:flex-row">
          <span>Atlas AI · Inteligência comercial imobiliária</span><span>Leads · Receita · Marketing · Previsibilidade</span>
        </footer>
      </div>
    </main>
  );
}
