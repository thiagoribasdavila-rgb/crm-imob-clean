import Link from "next/link";
import type { ReactNode } from "react";
import { AtlasLogo } from "@/components/atlas/atlas-logo";

/**
 * Shell das páginas PÚBLICAS (privacidade, termos, exclusão de dados).
 *
 * Precisa ser alcançável SEM login — o revisor e o rastreador da Meta abrem estas
 * URLs anonimamente durante o App Review. As rotas correspondentes estão na
 * allowlist de `proxy.ts`; sem isso o middleware redireciona para /login e a
 * revisão é reprovada.
 *
 * Mantém a linguagem visual da landing (mesmo fundo, acento e tipografia) e usa a
 * marca oficial (estrela-guia), para que qualquer página pública nova entre no
 * mesmo padrão sem recriar cabeçalho e rodapé.
 */

export type PublicPageShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  updatedAt: string;
  children: ReactNode;
};

const footerLinks = [
  { href: "/privacy", label: "Privacidade" },
  { href: "/terms", label: "Termos" },
  { href: "/data-deletion", label: "Exclusão de dados" },
];

export function PublicPageShell({ eyebrow, title, description, updatedAt, children }: PublicPageShellProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#020508] text-white selection:bg-sky-300 selection:text-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(14,165,233,.10),transparent_28rem),radial-gradient(circle_at_8%_88%,rgba(37,99,235,.07),transparent_32rem)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/60 to-transparent" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1100px] flex-col px-5 sm:px-8">
        <header className="flex h-24 items-center justify-between border-b border-white/[.07]">
          <Link href="/" className="group flex items-center gap-3" aria-label="Atlas AI — início">
            <AtlasLogo size={34} className="shrink-0" />
            <div>
              <p className="text-lg font-semibold tracking-[-.03em] leading-none">Atlas<span className="text-sky-400">.</span></p>
              <p className="mt-1 text-[8px] font-semibold uppercase tracking-[.24em] text-slate-500">Inteligência comercial imobiliária</p>
            </div>
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-white/10 bg-white/[.045] px-5 py-2.5 text-sm font-semibold transition hover:border-sky-300/25 hover:bg-sky-300/[.08]"
          >
            Acessar plataforma
          </Link>
        </header>

        <article className="flex-1 py-14 sm:py-20">
          <p className="text-[10px] font-bold uppercase tracking-[.24em] text-sky-400">{eyebrow}</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.03] tracking-[-.055em] sm:text-5xl">{title}</h1>
          <p className="mt-6 max-w-2xl text-sm leading-7 text-slate-400">{description}</p>
          <p className="mt-4 text-[11px] uppercase tracking-[.16em] text-slate-600">Última atualização: {updatedAt}</p>

          <div className="mt-12 space-y-10">{children}</div>
        </article>

        <footer className="flex flex-col gap-4 border-t border-white/[.07] py-8 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-[10px] uppercase tracking-[.16em] text-slate-700">Atlas AI · Inteligência comercial imobiliária</span>
          <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Documentos legais">
            {footerLinks.map((link) => (
              <Link key={link.href} href={link.href} className="text-[11px] font-medium text-slate-500 transition hover:text-sky-300">
                {link.label}
              </Link>
            ))}
          </nav>
        </footer>
      </div>
    </main>
  );
}

/** Seção padrão de documento legal — título + corpo, com hairline consistente. */
export function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 border-t border-white/[.07] pt-8 first:border-t-0 first:pt-0">
      <h2 id={`${id}-title`} className="text-xl font-semibold tracking-[-.03em] text-white sm:text-2xl">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-7 text-slate-400">{children}</div>
    </section>
  );
}

/** Lista com marcador discreto no acento da marca. */
export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, index) => (
        <li key={index} className="flex gap-3">
          <span aria-hidden="true" className="mt-[.6rem] h-1 w-1 shrink-0 rounded-full bg-sky-400" />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}
