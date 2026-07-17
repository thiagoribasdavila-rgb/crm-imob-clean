import Image from "next/image";
import Link from "next/link";

const capabilities = [
  { index: "01", title: "CRM vivo", detail: "Carteira, funil e próxima ação em um único fluxo." },
  { index: "02", title: "Inteligência imobiliária", detail: "Projetos, materiais, estoque e região conectados à venda." },
  { index: "03", title: "Decisão assistida", detail: "IA aplicada ao atendimento, previsão e performance comercial." },
];

const operatingSignals = ["Leads", "Pipeline", "Projetos", "Campanhas", "Inteligência"];

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
              <p className="text-[8px] font-semibold uppercase tracking-[.24em] text-slate-500">Real Estate OS</p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 text-xs text-slate-500 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,.7)]" /> Operação conectada</span>
            <Link href="/login" className="rounded-full border border-white/10 bg-white/[.045] px-5 py-2.5 text-sm font-semibold transition hover:border-sky-300/25 hover:bg-sky-300/[.08]">Acessar plataforma</Link>
          </div>
        </header>

        <section className="grid flex-1 items-center gap-10 py-14 lg:grid-cols-[1.05fr_.95fr] lg:py-10">
          <div className="relative z-10 max-w-3xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-sky-300/15 bg-sky-300/[.05] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.2em] text-sky-200">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-300" /> Tecnologia para o mercado imobiliário
            </div>

            <h1 className="max-w-[820px] text-[clamp(3.4rem,7vw,7.4rem)] font-semibold leading-[.88] tracking-[-.075em] text-white">
              Venda melhor.
              <span className="mt-2 block bg-gradient-to-r from-sky-200 via-sky-400 to-blue-600 bg-clip-text text-transparent">Decida antes.</span>
            </h1>

            <p className="mt-8 max-w-xl text-base leading-7 text-slate-400 sm:text-lg sm:leading-8">
              O sistema operacional comercial que conecta pessoas, imóveis, dados e inteligência para transformar cada oportunidade em uma ação clara.
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Link href="/login" className="group inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-white px-7 text-sm font-bold !text-slate-950 transition hover:-translate-y-0.5 hover:bg-sky-100">
                Entrar no Atlas <span className="transition group-hover:translate-x-1" aria-hidden="true">→</span>
              </Link>
              <Link href="/forgot-password" className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/10 px-7 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/[.04]">Recuperar acesso</Link>
            </div>

            <div className="mt-12 flex flex-wrap gap-x-6 gap-y-3 border-t border-white/[.07] pt-6">
              {operatingSignals.map((signal) => <span key={signal} className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.16em] text-slate-500"><span className="h-1 w-1 rounded-full bg-sky-400" />{signal}</span>)}
            </div>
          </div>

          <div className="relative mx-auto min-h-[500px] w-full max-w-[650px] lg:min-h-[700px]">
            <div className="absolute left-[8%] top-[10%] h-[68%] w-[84%] rounded-full bg-sky-400/[.08] blur-[100px]" />
            <div className="absolute inset-x-[5%] bottom-[14%] h-px bg-gradient-to-r from-transparent via-sky-300/60 to-transparent shadow-[0_0_40px_rgba(56,189,248,.45)]" />
            <div className="absolute inset-x-[8%] bottom-[14%] h-[38%] opacity-35 [background-image:linear-gradient(to_top,rgba(56,189,248,.35)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,.22)_1px,transparent_1px)] [background-size:100%_42px,52px_100%] [mask-image:linear-gradient(to_top,black,transparent)] [transform:perspective(500px)_rotateX(64deg)] [transform-origin:bottom]" />

            <div className="absolute left-0 top-[17%] z-20 rounded-2xl border border-white/[.09] bg-[#07101a]/80 px-4 py-3 backdrop-blur-xl">
              <p className="text-[9px] font-bold uppercase tracking-[.17em] text-slate-500">Signal</p>
              <p className="mt-1 text-sm font-semibold text-white">Próxima melhor ação</p>
            </div>
            <div className="absolute bottom-[23%] right-0 z-20 rounded-2xl border border-sky-300/[.13] bg-[#07101a]/80 px-4 py-3 backdrop-blur-xl">
              <p className="text-[9px] font-bold uppercase tracking-[.17em] text-sky-400">Atlas Brain</p>
              <p className="mt-1 text-sm font-semibold text-white">Contexto imobiliário ativo</p>
            </div>

            <Image src="/brand/atlas-robot-assistant.png" alt="Assistente de inteligência imobiliária Atlas" width={560} height={820} priority sizes="(max-width: 1024px) 75vw, 42vw" className="absolute bottom-[10%] left-1/2 z-10 h-[72%] w-auto -translate-x-1/2 object-contain opacity-90 drop-shadow-[0_40px_65px_rgba(14,165,233,.18)]" />
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
      </div>
    </main>
  );
}
