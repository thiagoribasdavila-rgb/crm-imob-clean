"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

const capabilities = [
  "CRM e pipeline inteligente",
  "Matching comprador × imóvel",
  "Marketing e atribuição",
  "Agentes, forecast e Digital Twin",
];

function LoginExperience() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError("E-mail ou senha inválidos. Verifique os dados e tente novamente.");
      setLoading(false);
      return;
    }

    router.replace(searchParams.get("next") || "/dashboard");
    router.refresh();
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050812] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_16%,rgba(14,165,233,.18),transparent_30rem),radial-gradient(circle_at_88%_20%,rgba(139,92,246,.17),transparent_28rem)]" />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] [background-size:44px_44px]" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-[1500px] items-center gap-12 px-5 py-10 lg:grid-cols-[1.15fr_.85fr] lg:px-12">
        <section className="hidden lg:block">
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-2xl border border-sky-400/20 bg-gradient-to-br from-sky-400/20 to-violet-500/20 text-xl font-black text-sky-200 shadow-[0_0_42px_rgba(56,189,248,.18)]">A</span>
            <div><p className="text-2xl font-black tracking-[-.04em]">ATLAS <span className="text-sky-400">AI</span></p><p className="text-[10px] font-semibold uppercase tracking-[.25em] text-slate-500">Real Estate Operating System</p></div>
          </div>
          <h1 className="mt-12 max-w-3xl text-6xl font-semibold leading-[1.02] tracking-[-.055em]">O sistema operacional inteligente do <span className="atlas-gradient-text">mercado imobiliário.</span></h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-400">Uma camada única para operação comercial, dados, marketing, imóveis, inteligência artificial e tomada de decisão.</p>
          <div className="mt-10 grid max-w-2xl grid-cols-2 gap-3">
            {capabilities.map((item, index) => <div key={item} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 backdrop-blur"><div className="mb-3 grid h-8 w-8 place-items-center rounded-xl bg-sky-400/10 text-xs text-sky-300">0{index + 1}</div><p className="text-sm font-medium text-slate-200">{item}</p></div>)}
          </div>
          <div className="mt-10 flex items-center gap-6 text-xs text-slate-500"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.7)]" /> Supabase conectado</span><span>Vercel Cloud</span><span>Multiempresa</span><span>LGPD-ready</span></div>
        </section>

        <section className="mx-auto w-full max-w-lg">
          <div className="mb-8 flex items-center gap-3 lg:hidden"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-400/15 font-black text-sky-300">A</span><div><p className="text-xl font-black">ATLAS <span className="text-sky-400">AI</span></p><p className="text-[9px] uppercase tracking-[.2em] text-slate-500">Real Estate OS</p></div></div>
          <div className="atlas-grid-glow rounded-[30px] border border-white/[0.1] bg-[#0a1020]/85 p-6 shadow-[0_40px_130px_rgba(0,0,0,.45)] backdrop-blur-2xl sm:p-9">
            <div><p className="atlas-eyebrow">Secure workspace</p><h2 className="mt-3 text-3xl font-semibold tracking-[-.035em]">Bem-vindo ao Atlas.</h2><p className="mt-3 text-sm leading-6 text-slate-400">Acesse sua operação e continue exatamente de onde parou.</p></div>
            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <label className="block"><span className="mb-2 block text-xs font-semibold uppercase tracking-[.12em] text-slate-400">E-mail corporativo</span><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full px-4 py-3.5" placeholder="voce@empresa.com" /></label>
              <label className="block"><span className="mb-2 block text-xs font-semibold uppercase tracking-[.12em] text-slate-400">Senha</span><input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full px-4 py-3.5" placeholder="••••••••" /></label>
              {error ? <p className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}
              <button type="submit" disabled={loading} className="atlas-button-primary w-full py-3.5 disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Autenticando ambiente..." : "Entrar no Atlas OS →"}</button>
            </form>
            <div className="mt-7 border-t border-white/[0.07] pt-6"><div className="flex items-center justify-between text-xs text-slate-500"><span>Ambiente criptografado</span><span>Atlas V3 · 2026</span></div></div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#050812]" />}>
      <LoginExperience />
    </Suspense>
  );
}
