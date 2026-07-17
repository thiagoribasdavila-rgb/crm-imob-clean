"use client";

import Link from "next/link";
import Image from "next/image";
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
import { safeAuthDestination } from "@/lib/auth/safe-redirect";

const REMEMBERED_EMAIL_KEY = "atlas.remembered-email";

const LOGIN_TIMEOUT_MS = 15_000;
async function withLoginTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("LOGIN_TIMEOUT")), LOGIN_TIMEOUT_MS); });
  try { return await Promise.race([operation, timeout]); } finally { if (timer) clearTimeout(timer); }
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
  const [rememberEmail, setRememberEmail] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [systemStatus, setSystemStatus] = useState<"checking" | "online" | "offline">("checking");
  const [loginStage, setLoginStage] = useState<"idle" | "auth" | "profile" | "redirect">("idle");

  const destination = useMemo(
    () => safeAuthDestination(searchParams.get("next")),
    [searchParams],
  );

  useEffect(() => {
    let active = true;
    const remembered = window.localStorage.getItem(REMEMBERED_EMAIL_KEY)?.trim() || "";
    if (remembered) {
      setEmail(remembered);
      setRememberEmail(true);
      window.setTimeout(() => passwordRef.current?.focus(), 0);
    } else {
      emailRef.current?.focus();
    }
    void Promise.all([
      fetch("/api/health", { cache: "no-store" }).then((response) => { if (active) setSystemStatus(response.ok ? "online" : "offline"); }).catch(() => { if (active) setSystemStatus("offline"); }),
      supabase.auth.getSession().then(({ data }) => { if (active && data.session?.user) { setLoginStage("redirect"); router.replace(destination); router.refresh(); } }),
    ]);
    return () => { active = false; };
  }, [destination, router]);

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
    setLoginStage("auth");
    setError("");

    try {
      const { data, error: signInError } = await withLoginTimeout(supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      }));

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

      if (!data.session?.user) {
        setError("A sessão não foi criada corretamente. Atualize a página e tente novamente.");
        return;
      }

      setLoginStage("profile");
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("organization_id,active")
        .eq("id", data.session.user.id)
        .maybeSingle();

      if (profileError || !profile?.organization_id) {
        await supabase.auth.signOut();
        setError("Usuário sem organização vinculada. Peça ao administrador para concluir o cadastro do perfil.");
        return;
      }

      if (profile.active === false) {
        await supabase.auth.signOut();
        setError("Usuário inativo. Peça ao administrador para reativar o acesso.");
        return;
      }

      if (rememberEmail) {
        window.localStorage.setItem(REMEMBERED_EMAIL_KEY, normalizedEmail);
      } else {
        window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }

      setLoginStage("redirect");
      router.replace(destination);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error && cause.message === "LOGIN_TIMEOUT" ? "A validação demorou mais que o esperado. Sua senha não foi alterada; tente novamente." : "Ocorreu uma falha inesperada. Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
      setLoginStage((current) => current === "redirect" ? current : "idle");
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#03060b] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(14,165,233,.18),transparent_34rem),radial-gradient(circle_at_72%_76%,rgba(37,99,235,.10),transparent_30rem),linear-gradient(115deg,#03060b_0%,#07101c_48%,#03060b_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[.16] [background-image:linear-gradient(rgba(125,211,252,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(125,211,252,.08)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_88%)]" />
      <div className="pointer-events-none absolute left-[12%] top-[18%] h-72 w-72 rounded-full bg-sky-400/[.08] blur-[100px]" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-[1380px] items-center gap-12 px-5 py-8 lg:grid-cols-[1.08fr_440px] lg:px-12 xl:gap-20">
        <section className="relative hidden min-h-[720px] overflow-hidden rounded-[38px] border border-white/[.06] bg-white/[.018] p-10 lg:flex lg:flex-col lg:justify-between xl:p-12">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_65%_42%,rgba(14,165,233,.13),transparent_24rem)]" />
          <Image src="/brand/atlas-robot-assistant.png" alt="Assistente de inteligência Atlas" width={420} height={630} priority className="pointer-events-none absolute -bottom-6 right-[-24px] h-[390px] w-auto select-none object-contain opacity-80 drop-shadow-[0_24px_42px_rgba(14,165,233,.14)] xl:right-2 xl:h-[430px]" />
          <div className="pointer-events-none absolute bottom-14 right-16 h-20 w-56 rounded-[50%] bg-sky-400/20 blur-3xl" />
          <div className="relative z-10">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl border border-sky-300/20 bg-sky-400/[.09] text-lg font-black text-sky-200 shadow-[0_0_32px_rgba(56,189,248,.10)]">A</span>
            <div><p className="text-2xl font-black tracking-[-.04em]">ATLAS <span className="text-sky-400">AI</span></p><p className="text-[10px] font-semibold uppercase tracking-[.25em] text-slate-500">Real Estate Intelligence</p></div>
          </div>
          <div className="mt-12 inline-flex items-center gap-2 rounded-full border border-sky-300/10 bg-sky-300/[.045] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.18em] text-sky-200"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-300" /> AI Brain conectado ao comercial</div>
          <h1 className="mt-6 max-w-[480px] text-5xl font-semibold leading-[1.02] tracking-[-.055em] xl:max-w-[540px] xl:text-6xl">Inteligência que transforma <span className="bg-gradient-to-r from-white via-sky-200 to-blue-400 bg-clip-text text-transparent">movimento em venda.</span></h1>
          <p className="mt-6 max-w-sm text-base leading-7 text-slate-400">Um ambiente único para leads, imóveis, equipe, campanhas e decisões comerciais.</p>
          </div>
          <div className="relative z-10 grid max-w-[450px] grid-cols-3 gap-3">
            {[ ["Lead Intelligence", "Prioridade clara"], ["Copiloto único", "Próxima ação"], ["Operação viva", "Aprendizado contínuo"] ].map(([title, detail]) => <div key={title} className="rounded-2xl border border-white/[.07] bg-[#07101a]/70 p-4 backdrop-blur-xl"><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">{title}</p><p className="mt-2 text-sm font-semibold text-slate-100">{detail}</p></div>)}
          </div>
        </section>

        <section className="mx-auto w-full max-w-lg">
          <div className="mb-6 flex items-center justify-between gap-3 lg:hidden"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-400/15 font-black text-sky-300">A</span><div><p className="text-xl font-black">ATLAS <span className="text-sky-400">AI</span></p><p className="text-[9px] uppercase tracking-[.2em] text-slate-500">Real Estate Intelligence</p></div></div><span role="img" aria-label="Assistente Atlas" className="h-16 w-12 bg-[url('/brand/atlas-robot-assistant.png')] bg-contain bg-center bg-no-repeat drop-shadow-[0_12px_20px_rgba(14,165,233,.18)]" /></div>
          <div className="relative overflow-hidden rounded-[30px] border border-sky-300/[0.12] bg-[#08101a]/90 p-6 shadow-[0_35px_110px_rgba(0,0,0,.48)] backdrop-blur-2xl sm:p-9">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/70 to-transparent" />
            <div>
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs font-semibold text-slate-500">Acesso seguro</p>
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[.12em] ${systemStatus === "online" ? "border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-300" : systemStatus === "offline" ? "border-amber-400/15 bg-amber-400/[0.07] text-amber-300" : "border-white/10 bg-white/[.04] text-slate-400"}`}><span className={`h-1.5 w-1.5 rounded-full ${systemStatus === "online" ? "bg-emerald-400" : systemStatus === "offline" ? "bg-amber-400" : "animate-pulse bg-slate-500"}`} /> {systemStatus === "online" ? "Sistema disponível" : systemStatus === "offline" ? "Conexão instável" : "Verificando"}</span>
              </div>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-.035em]">Entrar no Atlas</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Seu command center comercial está pronto.</p>
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
                    className="w-full border-white/10 bg-white/[.035] px-4 py-3.5 pr-11 transition focus:border-sky-400/50 focus:ring-2 focus:ring-sky-400/10"
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
                    className="w-full border-white/10 bg-white/[.035] px-4 py-3.5 pr-14 transition focus:border-sky-400/50 focus:ring-2 focus:ring-sky-400/10"
                    placeholder="Digite sua senha"
                    aria-invalid={Boolean(error)}
                    aria-describedby={[capsLock ? "caps-lock-warning" : "", error ? "login-error" : ""].filter(Boolean).join(" ") || undefined}
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
                  <input type="checkbox" checked={rememberEmail} onChange={(event) => setRememberEmail(event.target.checked)} className="h-4 w-4 rounded border-white/20 bg-white/5 text-sky-400" />
                  Lembrar meu e-mail
                </label>
                <Link href="/forgot-password" className="text-xs font-medium text-sky-300 transition hover:text-sky-200">Esqueci minha senha</Link>
              </div>

              {error ? <div id="login-error" role="alert" aria-live="assertive" className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100"><p className="font-semibold">Não foi possível entrar</p><p className="mt-1 leading-5 text-rose-200/90">{error}</p>{/senha|credenciais|incorretos/i.test(error) ? <Link href={`/forgot-password${email ? `?email=${encodeURIComponent(email.trim().toLowerCase())}` : ""}`} className="mt-3 inline-flex text-xs font-bold text-white underline underline-offset-4">Redefinir minha senha</Link> : null}</div> : null}

              <button type="submit" disabled={loading} aria-busy={loading} className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-300 via-sky-400 to-blue-500 px-5 py-3.5 text-sm font-bold text-[#03111d] shadow-[0_14px_40px_rgba(14,165,233,.20)] transition hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">
                {loading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" /> {loginStage === "profile" ? "Preparando sua operação..." : loginStage === "redirect" ? "Abrindo seu painel..." : "Validando acesso..."}</> : <>Entrar no Atlas OS <span aria-hidden="true">→</span></>}
              </button>
              {systemStatus === "offline" ? <button type="button" onClick={() => window.location.reload()} className="w-full text-center text-xs font-semibold text-amber-200">Tentar reconectar</button> : null}
            </form>

            <div className="mt-7 border-t border-white/[0.07] pt-6">
              <div className="flex items-center justify-between gap-4 text-xs text-slate-500"><span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-sky-400" /> Sessão protegida</span><span>Atlas V3</span></div>
            </div>
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
