"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const actions = [
  { title: "Novo lead", description: "Cadastrar e qualificar um novo contato", href: "/leads/new", icon: "＋", tone: "sky" },
  { title: "Abrir pipeline", description: "Mover oportunidades e acompanhar conversão", href: "/pipeline", icon: "↗", tone: "violet" },
  { title: "Nova tarefa", description: "Criar follow-up e organizar a operação", href: "/tasks", icon: "✓", tone: "emerald" },
  { title: "Cadastrar imóvel", description: "Adicionar unidade ou ativo ao estoque", href: "/properties", icon: "⌂", tone: "amber" },
  { title: "Novo empreendimento", description: "Estruturar lançamento, estoque e materiais", href: "/developments", icon: "◇", tone: "rose" },
  { title: "Criar campanha", description: "Planejar aquisição, verba e atribuição", href: "/marketing", icon: "◎", tone: "cyan" },
];

const toneClasses: Record<string, string> = {
  sky: "border-sky-400/20 bg-sky-400/10 text-sky-200",
  violet: "border-violet-400/20 bg-violet-400/10 text-violet-200",
  emerald: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  amber: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  rose: "border-rose-400/20 bg-rose-400/10 text-rose-200",
  cyan: "border-cyan-400/20 bg-cyan-400/10 text-cyan-200",
};

export default function AtlasQuickCreate() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const contextualActions = useMemo(() => { const match = pathname.match(/^\/leads\/([0-9a-f-]{36})(?:\/|$)/i); if (!match) return actions; const lead = `/leads/${match[1]}`; return [{ title: "Enviar mensagem", description: "Continuar o atendimento desta lead", href: `${lead}/messages`, icon: "↗", tone: "sky" }, { title: "Criar tarefa", description: "Agendar o próximo follow-up", href: `${lead}/tasks`, icon: "✓", tone: "emerald" }, { title: "Agendar visita", description: "Abrir a agenda vinculada à lead", href: `${lead}/schedule`, icon: "□", tone: "violet" }, { title: "Registrar ligação", description: "Salvar contato e resultado", href: `${lead}/calls`, icon: "◌", tone: "amber" }, { title: "Adicionar nota", description: "Registrar contexto na timeline", href: `${lead}/notes`, icon: "＋", tone: "rose" }, { title: "Voltar à Lead 360", description: "Ver qualificação, imóveis e histórico", href: lead, icon: "◎", tone: "cyan" }]; }, [pathname]);

  useEffect(() => {
    const openPanel = () => setOpen(true);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setOpen((current) => !current);
      }
      if (event.key === "Escape") setOpen(false);
      const position = Number(event.key) - 1;
      if (open && position >= 0 && contextualActions[position]) { event.preventDefault(); setOpen(false); router.push(contextualActions[position].href); }
    };

    window.addEventListener("atlas:open-quick-create", openPanel);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("atlas:open-quick-create", openPanel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextualActions, open, router]);

  function navigate(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 grid h-14 w-14 place-items-center rounded-2xl border border-sky-300/20 bg-gradient-to-br from-sky-400 to-blue-600 text-2xl font-light text-white shadow-[0_18px_60px_rgba(14,165,233,.35)] transition hover:-translate-y-1 hover:shadow-[0_24px_80px_rgba(14,165,233,.5)]"
        aria-label="Abrir criação rápida"
      >
        +
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/70 p-4 backdrop-blur-md sm:items-center" role="dialog" aria-modal="true" aria-label="Criação rápida">
          <button className="absolute inset-0" onClick={() => setOpen(false)} aria-label="Fechar criação rápida" />
          <section className="relative w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/10 bg-[#070d1b]/95 shadow-[0_40px_160px_rgba(0,0,0,.65)]">
            <header className="flex items-center justify-between border-b border-white/[0.07] px-5 py-5 sm:px-7">
              <div>
                <p className="atlas-eyebrow">Ações rápidas · contexto atual</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Qual é a próxima ação?</h2>
                <p className="mt-1 text-sm text-slate-400">Atalhos adaptados à tela para reduzir cliques e manter o ritmo comercial.</p>
              </div>
              <div className="flex items-center gap-3">
                <kbd className="hidden rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-slate-500 sm:block">Alt A</kbd>
                <button onClick={() => setOpen(false)} className="atlas-icon-button" aria-label="Fechar">×</button>
              </div>
            </header>

            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6">
              {contextualActions.map((action, index) => (
                <button
                  key={action.title}
                  onClick={() => navigate(action.href)}
                  className="group flex items-start gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 text-left transition hover:-translate-y-0.5 hover:border-sky-400/20 hover:bg-sky-400/[0.05]"
                >
                  <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border text-lg ${toneClasses[action.tone]}`}>{action.icon}</span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-white">{action.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-400">{action.description}</span>
                  </span>
                  <span className="ml-auto mt-1 text-slate-600 transition group-hover:translate-x-1 group-hover:text-sky-300">→</span>
                  <kbd className="rounded-md border border-white/10 px-1.5 py-0.5 text-[9px] text-slate-600">{index + 1}</kbd>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
