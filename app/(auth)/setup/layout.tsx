import Link from "next/link";
import type { ReactNode } from "react";

import { readBootstrapInstallationStatus } from "@/lib/bootstrap/installation-status";

export const dynamic = "force-dynamic";

function SetupState({
  title,
  description,
  tone,
}: {
  title: string;
  description: string;
  tone: "complete" | "unavailable";
}) {
  const complete = tone === "complete";

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#03060b] px-5 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(14,165,233,.16),transparent_34rem),radial-gradient(circle_at_80%_80%,rgba(99,102,241,.1),transparent_30rem)]" />
      <section className="relative w-full max-w-xl rounded-[32px] border border-white/[.09] bg-[#070d15]/95 p-7 shadow-[0_40px_120px_rgba(0,0,0,.55)] backdrop-blur-2xl sm:p-10">
        <Link href="/" className="inline-flex items-center gap-3" aria-label="Voltar ao início">
          <span className="grid h-11 w-11 place-items-center rounded-2xl border border-sky-300/20 bg-sky-400/[.09] text-lg font-black text-sky-200">
            A
          </span>
          <div>
            <p className="text-xl font-black tracking-[-.04em]">
              ATLAS <span className="text-sky-400">ONE</span>
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-slate-500">
              Primeiro acesso protegido
            </p>
          </div>
        </Link>

        <span
          className={`mt-10 inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[.14em] ${
            complete
              ? "border-emerald-400/20 bg-emerald-400/[.08] text-emerald-300"
              : "border-amber-400/20 bg-amber-400/[.08] text-amber-200"
          }`}
        >
          {complete ? "Ambiente protegido" : "Configuração necessária"}
        </span>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-.05em]">{title}</h1>
        <p className="mt-4 text-sm leading-6 text-slate-400">{description}</p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/login"
            className="flex h-12 flex-1 items-center justify-center rounded-full bg-white px-5 text-sm font-bold !text-slate-950 transition hover:bg-sky-100"
          >
            Seguir para o login
          </Link>
          <Link
            href="/"
            className="flex h-12 flex-1 items-center justify-center rounded-full border border-white/10 px-5 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/[.04]"
          >
            Voltar ao início
          </Link>
        </div>
      </section>
    </main>
  );
}

export default async function SetupLayout({ children }: { children: ReactNode }) {
  let status: Awaited<ReturnType<typeof readBootstrapInstallationStatus>> | null = null;

  try {
    status = await readBootstrapInstallationStatus();
  } catch {
    status = null;
  }

  if (!status) {
    return (
      <SetupState
        tone="unavailable"
        title="Não foi possível verificar a instalação"
        description="Confira a conexão do Supabase e a chave de serviço configurada na Hostinger. Nenhuma alteração foi realizada."
      />
    );
  }

  if (status.state === "complete") {
    return (
      <SetupState
        tone="complete"
        title="Instalação já concluída"
        description="O administrador inicial já foi ativado. Novos usuários devem ser criados dentro da área administrativa do Atlas One."
      />
    );
  }

  return children;
}
