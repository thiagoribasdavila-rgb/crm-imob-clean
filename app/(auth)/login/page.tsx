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
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { safeAuthDestination } from "@/lib/auth/safe-redirect";
import {
  parseAtlasAuthContext,
  storeAtlasAuthContext,
} from "@/lib/auth/atlas-auth-context";
import { AtlasLogo } from "@/components/atlas/atlas-logo";
import { TiltShell } from "@/components/atlas/tilt-shell";

const REMEMBERED_EMAIL_KEY = "atlas.remembered-email";

const LOGIN_TIMEOUT_MS = 15_000;
async function withLoginTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("LOGIN_TIMEOUT")), LOGIN_TIMEOUT_MS); });
  try { return await Promise.race([operation, timeout]); } finally { if (timer) clearTimeout(timer); }
}

async function confirmServerSession(): Promise<Response> {
  let lastResponse: Response | undefined;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    lastResponse = await withLoginTimeout(fetch("/api/v1/auth/me", {
      cache: "no-store",
      credentials: "include",
      headers: { Accept: "application/json" },
    }));

    if (lastResponse.ok || lastResponse.status !== 401) return lastResponse;
    await new Promise((resolve) => window.setTimeout(resolve, 200 * (attempt + 1)));
  }

  return lastResponse!;
}

async function destinationForSession(response: Response, requested: string | null) {
  if (requested) return safeAuthDestination(requested);
  // Entrar no sistema = entrar na sala de comando: a visão "o que está
  // acontecendo agora", por papel, com tempo real. O /dashboard clássico
  // continua a um clique (item "Início" do menu) e deep links via ?next=
  // seguem respeitados acima.
  return "/command-center";
}

async function readSessionFailure(response: Response) {
  const payload = await response.clone().json().catch(() => null) as { error?: { code?: string } } | null;
  const code = payload?.error?.code;
  if (code === "PROFILE_REQUIRED") return "Seu login está correto, mas o perfil do Atlas não foi encontrado.";
  if (code === "PROFILE_INACTIVE") return "Seu perfil está inativo. Solicite a liberação ao administrador.";
  if (code === "PROFILE_ORGANIZATION_REQUIRED") return "Seu perfil ainda não possui uma organização vinculada.";
  if (code === "ORGANIZATION_REQUIRED") return "A organização vinculada ao seu perfil não foi encontrada.";
  if (code === "ORGANIZATION_INACTIVE") return "A organização vinculada ao seu acesso está inativa.";
  if (code === "PROFILE_LOOKUP_FAILED") return "Não foi possível carregar seu perfil. Tente novamente em instantes.";
  if (code === "ORGANIZATION_LOOKUP_FAILED") return "Não foi possível carregar sua organização. Tente novamente em instantes.";
  return "O acesso foi autenticado, mas os dados do painel não puderam ser carregados.";
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
  const requestedDestination = searchParams.get("next");

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
      supabase.auth.getSession().then(async ({ data }) => {
        if (!active || !data.session?.user) return;
        const response = await confirmServerSession().catch(() => undefined);
        if (!active) return;
        if (response?.ok) {
          setLoading(true);
          setLoginStage("redirect");
          window.location.replace(await destinationForSession(response, requestedDestination));
        } else if (response?.status === 401 || response?.status === 403) {
          await supabase.auth.signOut();
        }
      }),
    ]);
    return () => { active = false; };
  }, [destination, requestedDestination]);

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
    let redirecting = false;

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
      const sessionResponse = await confirmServerSession();

      if (sessionResponse.status === 401) {
        await supabase.auth.signOut();
        setError("A sessão foi autenticada, mas não chegou ao servidor. Atualize a página e tente novamente.");
        return;
      }

      if (sessionResponse.status === 403) {
        const message = await readSessionFailure(sessionResponse);
        await supabase.auth.signOut();
        setError(message);
        return;
      }

      if (!sessionResponse.ok) {
        setError(await readSessionFailure(sessionResponse));
        return;
      }

      const sessionContext = await sessionResponse.clone().json().catch(() => null);
      const resolvedContext = parseAtlasAuthContext(sessionContext);
      if (resolvedContext) storeAtlasAuthContext(resolvedContext);

      if (rememberEmail) {
        window.localStorage.setItem(REMEMBERED_EMAIL_KEY, normalizedEmail);
      } else {
        window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }

      setLoginStage("redirect");
      redirecting = true;
      window.location.assign(await destinationForSession(sessionResponse, requestedDestination));
    } catch (cause) {
      setError(cause instanceof Error && cause.message === "LOGIN_TIMEOUT" ? "A validação demorou mais que o esperado. Sua senha não foi alterada; tente novamente." : "Ocorreu uma falha inesperada. Verifique sua conexão e tente novamente.");
    } finally {
      if (!redirecting) {
        setLoading(false);
        setLoginStage("idle");
      }
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070b16] text-white">
      {/* Deck de comando 3D: céu limpo com um único wash do acento + chão em grade
          que recede em perspectiva real (transform estático — custo zero de frame). */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1100px_520px_at_74%_-10%,rgba(56,189,248,.09),transparent_60%)]" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[-35%] bottom-0 h-[78%] opacity-[.55] [transform:perspective(820px)_rotateX(58deg)] [transform-origin:50%_100%] [background-image:linear-gradient(rgba(56,189,248,.26)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,.26)_1px,transparent_1px)] [background-size:54px_54px] [mask-image:linear-gradient(to_top,black_26%,transparent_92%)]"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-[36%] h-px bg-gradient-to-r from-transparent via-sky-300/20 to-transparent" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-[1440px] items-center gap-12 px-5 py-8 lg:grid-cols-[1.1fr_440px] lg:px-12 xl:gap-24">
        <section className="cc5-reveal relative hidden min-h-[720px] overflow-hidden border-r border-[rgba(148,163,184,.12)] p-10 lg:flex lg:flex-col lg:justify-between xl:p-12" style={{ animationDelay: "0ms" }}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_65%_42%,rgba(14,165,233,.11),transparent_24rem)]" />
          <Image src="/brand/atlas-robot-assistant.png" alt="Assistente de inteligência Atlas" width={420} height={630} priority className="pointer-events-none absolute -bottom-4 -right-20 h-[380px] w-auto select-none object-contain opacity-80 drop-shadow-[0_24px_42px_rgba(14,165,233,.14)] xl:-right-20 xl:h-[420px]" />
          <div className="pointer-events-none absolute bottom-14 right-16 h-20 w-56 rounded-[50%] bg-sky-400/15 blur-3xl" />
          <div className="relative z-10">
          <Link href="/" className="inline-flex items-center gap-4" aria-label="Voltar para a página inicial do Atlas">
            <AtlasLogo size={48} className="shrink-0" />
            <div><p className="text-2xl font-black tracking-[-.04em]">ATLAS <span className="text-sky-400">AI</span></p><p className="font-mono text-[10px] font-medium uppercase tracking-[.22em] text-slate-500">Real Estate Intelligence</p></div>
          </Link>
          <div className="mt-12 inline-flex items-center gap-2 rounded-full border border-sky-300/10 bg-sky-300/[.045] px-3 py-1.5 font-mono text-[11px] font-medium text-sky-200"><span className="h-1.5 w-1.5 motion-safe:animate-pulse rounded-full bg-sky-300" /> IA proativa conectada ao comercial</div>
          <h1 className="mt-6 max-w-[520px] text-5xl font-semibold leading-[.98] tracking-[-.06em] xl:max-w-[580px] xl:text-6xl">Sua sala de comando para <span className="text-sky-300">decidir e vender.</span></h1>
          <p className="mt-6 max-w-sm text-base leading-7 text-slate-400">A IA prioriza, a equipe decide: leads, imóveis, campanhas e a próxima ação — num só lugar.</p>
          </div>
          <div className="relative z-10 grid max-w-[380px] grid-cols-3 border-y border-[rgba(148,163,184,.12)] py-5">
            {[ ["Prioridades agora", "IA proativa"], ["Copiloto único", "Próxima ação"], ["Operação viva", "Tempo real"] ].map(([title, detail], index) => <div key={title} className={`px-4 ${index ? "border-l border-[rgba(148,163,184,.12)]" : ""}`}><p className="font-mono text-[10px] font-medium uppercase tracking-[.16em] text-slate-500">{title}</p><p className="mt-2 text-sm font-semibold text-slate-200">{detail}</p></div>)}
          </div>
        </section>

        <section className="mx-auto w-full max-w-lg [perspective:1400px]">
          <div className="cc5-reveal mb-6 flex items-center justify-between gap-3 lg:hidden" style={{ animationDelay: "0ms" }}><div className="flex items-center gap-3"><AtlasLogo size={44} className="shrink-0" /><div><p className="text-xl font-black tracking-[-.03em]">ATLAS <span className="text-sky-400">AI</span></p><p className="font-mono text-[10px] uppercase tracking-[.22em] text-slate-500">Real Estate Intelligence</p></div></div><span role="img" aria-label="Assistente Atlas" className="h-16 w-12 bg-[url('/brand/atlas-robot-assistant.png')] bg-contain bg-center bg-no-repeat drop-shadow-[0_12px_20px_rgba(14,165,233,.18)]" /></div>
          <TiltShell delayMs={70} className="cc5-reveal relative overflow-hidden rounded-[28px] border border-[rgba(148,163,184,.16)] bg-[linear-gradient(180deg,#0f1830_0%,#0b1224_100%)] p-6 shadow-[0_40px_120px_rgba(0,0,0,.5)] sm:p-9">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/70 to-transparent" />
            <div className="motion-safe:[transform:translateZ(14px)]">
              <div className="flex items-center justify-between gap-4">
                <p className="font-mono text-[11px] font-medium uppercase tracking-[.24em] text-slate-500">Sala de comando</p>
                <span className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1 font-mono text-[11px] font-medium tabular-nums ${systemStatus === "online" ? "border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-300" : systemStatus === "offline" ? "border-amber-400/15 bg-amber-400/[0.07] text-amber-300" : "border-[rgba(148,163,184,.22)] bg-white/[.04] text-slate-400"}`}><span className={`h-1.5 w-1.5 rounded-full ${systemStatus === "online" ? "bg-emerald-400" : systemStatus === "offline" ? "bg-amber-400" : "animate-pulse bg-slate-500"}`} /> {systemStatus === "online" ? "Sistema disponível" : systemStatus === "offline" ? "Conexão instável" : "Verificando"}</span>
              </div>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-.05em]">Bem-vindo de volta.</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Entre para abrir a sua sala de comando.</p>
            </div>

            <form className="mt-8 space-y-5 motion-safe:[transform:translateZ(8px)]" onSubmit={handleSubmit} noValidate>
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-slate-400">E-mail corporativo</span>
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
                    className="h-14 w-full border-[rgba(148,163,184,.16)] bg-white/[.03] px-4 pr-11 transition hover:border-[rgba(148,163,184,.22)] focus:border-sky-400/50 focus:ring-2 focus:ring-sky-400/10"
                    placeholder="voce@empresa.com"
                    aria-invalid={Boolean(error)}
                  />
                  {email ? <button type="button" onClick={() => { setEmail(""); emailRef.current?.focus(); }} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-500 transition hover:text-slate-200" aria-label="Limpar e-mail">×</button> : null}
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-medium text-slate-400">Senha</span>
                <div className="relative">
                  <input
                    ref={passwordRef}
                    required
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    enterKeyHint="go"
                    value={password}
                    onChange={(event) => { setPassword(event.target.value); if (error) setError(""); }}
                    onKeyDown={updateCapsLock}
                    onKeyUp={updateCapsLock}
                    onBlur={() => setCapsLock(false)}
                    className="h-14 w-full border-[rgba(148,163,184,.16)] bg-white/[.03] px-4 pr-14 transition hover:border-[rgba(148,163,184,.22)] focus:border-sky-400/50 focus:ring-2 focus:ring-sky-400/10"
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
                  <input type="checkbox" checked={rememberEmail} onChange={(event) => setRememberEmail(event.target.checked)} className="h-4 w-4 rounded border-white/20 bg-white/5 accent-sky-400" />
                  Lembrar meu e-mail
                </label>
                <Link href="/forgot-password" className="text-xs font-medium text-sky-300 transition hover:text-sky-200">Esqueci minha senha</Link>
              </div>

              {error ? <div id="login-error" role="alert" aria-live="assertive" className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100"><p className="font-semibold">Não foi possível entrar</p><p className="mt-1 leading-5 text-rose-200/90">{error}</p>{/senha|credenciais|incorretos/i.test(error) ? <Link href={`/forgot-password${email ? `?email=${encodeURIComponent(email.trim().toLowerCase())}` : ""}`} className="mt-3 inline-flex text-xs font-bold text-white underline underline-offset-4">Redefinir minha senha</Link> : null}</div> : null}

              <button type="submit" disabled={loading} aria-busy={loading} className="group flex h-14 w-full items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-bold !text-slate-950 shadow-[0_16px_45px_rgba(255,255,255,.08)] transition hover:-translate-y-0.5 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60">
                {loading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" /> {loginStage === "profile" ? "Preparando sua operação..." : loginStage === "redirect" ? "Abrindo seu painel..." : "Validando acesso..."}</> : <>Entrar no Atlas OS <span aria-hidden="true">→</span></>}
              </button>
              <p className="sr-only" role="status" aria-live="polite">
                {loading ? (loginStage === "profile" ? "Acesso validado. Preparando sua operação." : loginStage === "redirect" ? "Acesso validado. Abrindo seu painel." : "Validando suas credenciais.") : "Formulário de acesso pronto."}
              </p>
              {systemStatus === "offline" ? <button type="button" onClick={() => window.location.reload()} className="w-full text-center text-xs font-semibold text-amber-200">Tentar reconectar</button> : null}
            </form>

            <div className="mt-7 border-t border-[rgba(148,163,184,.12)] pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] font-medium uppercase tracking-[.14em] text-slate-600"><span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-sky-400" /> Sessão protegida</span><span>Dados isolados</span><span className="tabular-nums">Atlas V3</span></div>
            </div>
          </TiltShell>
          <Link href="/" className="cc5-reveal mx-auto mt-5 flex w-fit items-center gap-2 text-xs text-slate-600 transition hover:text-slate-300" style={{ animationDelay: "140ms" }}><span aria-hidden="true">←</span> Voltar para o início</Link>
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
