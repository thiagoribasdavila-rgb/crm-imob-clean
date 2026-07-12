"use client";

import Link from "next/link";
import {
  FormEvent,
  KeyboardEvent,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

const REMEMBERED_EMAIL_KEY = "atlas.remembered-email";

const capabilities = [
  "CRM e pipeline inteligente",
  "Matching comprador × imóvel",
  "Marketing e atribuição",
  "Agentes, forecast e Digital Twin",
];

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return hidden ? (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8">
      <path d="M3 3l18 18" strokeLinecap="round" />
      <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" strokeLinecap="round" />
      <path d="M9.9 4.3A10.7 10.7 0 0 1 12 4c5.2 0 8.6 4.4 9.4 5.6a.8.8 0 0 1 0 .8 16 16 0 0 1-3.1 3.7" strokeLinecap="round" />
      <path d="M6.2 6.2A16.1 16.1 0 0 0 2.6 9.6a.8.8 0 0 0 0 .8C3.4 11.6 6.8 16 12 16c1 0 2-.2 2.8-.5" strokeLinecap="round" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8">
      <path d="M2.6 9.6C3.4 8.4 6.8 4 12 4s8.6 4.4 9.4 5.6a.8.8 0 0 1 0 .8C20.6 11.6 17.2 16 12 16s-8.6-4.4-9.4-5.6a.8.8 0 0 1 0-.8Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function LoginExperience() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(true);
  const [capsLock, setCapsLock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const destination = useMemo(
    () => safeNextPath(searchParams.get("next")),
    [searchParams],
  );

  useEffect(() => {
    const remembered = window.localStorage.getItem(REMEMBERED_EMAIL_KEY)?.trim() || "";
    if (remembered) {
      setEmail(remembered);
      setRememberEmail(true);
      window.setTimeout(() => passwordRef.current?.focus(), 0);
      return;
    }

    emailRef.current?.focus();
  }, []);

  function updateCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState("CapsLock"));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setError("Digite um e-mail válido para continuar.");
      emailRef.current?.focus();
      return;
    }

    if (!password) {
      setError("Digite sua senha para continuar.");
      passwordRef.current?.focus();
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (signInError) {
        const message = signInError.message.toLowerCase();
        if (message.includes("email not confirmed")) {
          setError("Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada.");
        } else if (message.includes("invalid login credentials")) {
          setError("E-mail ou senha incorretos. Confira os dados ou redefina sua senha.");
        } else if (message.includes("too many") || message.includes("rate limit")) {
          setError("Muitas tentativas em sequência. Aguarde um minuto e tente novamente.");
        } else if (message.includes("fetch") || message.includes("network")) {
          setError("Não foi possível conectar ao Atlas. Verifique sua internet e tente novamente.");
        } else {
          setError("Não foi possível autenticar agora. Tente novamente em instantes.");
        }
        return;
      }

      if (!data.session) {
        setError("A sessão não foi criada corretamente. Atualize a página e tente novamente.");
        return;
      }

      if (rememberEmail) {
        window.localStorage.setItem(REMEMBERED_EMAIL_KEY, normalizedEmail);
      } else {
        window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }

      router.replace(destination);
      router.refresh();
    } catch {
      setError("Ocorreu uma falha inesperada. Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
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
          <div className="mt-10 flex items-center gap-6 text-xs text-slate-500"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.7)]" /> Ambiente operacional</span><span>Vercel Cloud</span><span>Multiempresa</span><span>LGPD-ready</span></div>
        </section>

        <section className="mx-auto w-full max-w-lg">
          <div className="mb-8 flex items-center gap-3 lg:hidden"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-400/15 font-black text-sky-300">A</span><div><p className="text-xl font-black">ATLAS <span className="text-sky-400">AI</span></p><p className="text-[9px] uppercase tracking-[.2em] text-slate-500">Real Estate OS</p></div></div>
          <div className="atlas-grid-glow rounded-[30px] border border-white/[0.1] bg-[#0a1020]/85 p-6 shadow-[0_40px_130px_rgba(0,0,0,.45)] backdrop-blur-2xl sm:p-9">
            <div>
              <div className="flex items-center justify-between gap-4">
                <p className="atlas-eyebrow">Secure workspace</p>
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/[0.07] px-3 py-1 text-[10px] font-semibold uppercase tracking-[.12em] text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Online</span>
              </div>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-.035em]">Bem-vindo ao Atlas.</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">Acesse sua operação com segurança e continue exatamente de onde parou.</p>
            </div>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[.12em] text-slate-400">E-mail corporativo</span>
                <div className="relative">
                  <input
                    ref={emailRef}
                    required
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    autoComplete="username"
                    value={email}
                    onChange={(event) => { setEmail(event.target.value); if (error) setError(""); }}
                    className="w-full px-4 py-3.5 pr-11"
                    placeholder="voce@empresa.com"
                    aria-invalid={Boolean(error)}
                  />
                  {email ? <button type="button" onClick={() => { setEmail(""); emailRef.current?.focus(); }} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-500 transition hover:text-slate-200" aria-label="Limpar e-mail">×</button> : null}
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[.12em] text-slate-400">Senha</span>
                <div className="relative">
                  <input
                    ref={passwordRef}
                    required
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => { setPassword(event.target.value); if (error) setError(""); }}
                    onKeyDown={updateCapsLock}
                    onKeyUp={updateCapsLock}
                    onBlur={() => setCapsLock(false)}
                    className="w-full px-4 py-3.5 pr-14"
                    placeholder="Digite sua senha"
                    aria-invalid={Boolean(error)}
                    aria-describedby={capsLock ? "caps-lock-warning" : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute inset-y-0 right-0 grid w-14 place-items-center text-slate-500 transition hover:text-sky-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    aria-pressed={showPassword}
                    title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    <EyeIcon hidden={showPassword} />
                  </button>
                </div>
                {capsLock ? <p id="caps-lock-warning" className="mt-2 text-xs font-medium text-amber-300">Caps Lock está ativado.</p> : null}
              </label>

              <div className="flex items-center justify-between gap-4">
                <label className="flex cursor-pointer items-center gap-2.5 text-xs text-slate-400">
                  <input type="checkbox" checked={rememberEmail} onChange={(event) => setRememberEmail(event.target.checked)} className="h-4 w-4 rounded border-white/15 bg-white/5 accent-sky-400" />
                  Lembrar meu e-mail
                </label>
                <Link href="/forgot-password" className="text-xs font-semibold text-sky-300 transition hover:text-sky-200">Esqueci minha senha</Link>
              </div>

              {error ? <div role="alert" aria-live="assertive" className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3.5 text-sm leading-6 text-rose-100"><p className="font-semibold">Não foi possível entrar</p><p className="mt-0.5 text-rose-200/80">{error}</p></div> : null}

              <button type="submit" disabled={loading} className="atlas-button-primary relative w-full overflow-hidden py-3.5 disabled:cursor-not-allowed disabled:opacity-60">
                <span className="inline-flex items-center justify-center gap-2">
                  {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white" aria-hidden="true" /> : null}
                  {loading ? "Validando acesso seguro..." : "Entrar no Atlas OS →"}
                </span>
              </button>
            </form>

            <div className="mt-7 border-t border-white/[0.07] pt-6">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><span className="inline-flex items-center gap-2"><span aria-hidden="true">🔒</span> Sessão protegida e criptografada</span><span>Atlas V3 · 2026</span></div>
            </div>
          </div>
          <p className="mt-5 text-center text-[11px] leading-5 text-slate-600">Acesso restrito a usuários autorizados. Nunca compartilhe sua senha.</p>
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
