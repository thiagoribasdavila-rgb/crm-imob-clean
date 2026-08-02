"use client";

import Link from "next/link";
import Image from "next/image";
import {
  type CSSProperties,
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
import { configuracaoEhPlaceholder } from "@/utils/supabase/env";
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
    /* ── A ESCALA, DECLARADA NA PRÓPRIA TELA ────────────────────────────────
       Medido em 02/08/2026, nesta página em 1440×900: OITO tamanhos de fonte
       (60, 36, 24, 16, 14, 12, 11, 10) para 21 textos — quase um tamanho a
       cada dois textos —, quatro pesos e QUATRO raios de canto distintos.
       Isso não é falta de beleza, é falta de regra: sem escala para
       consultar, cada texto novo inventa o próprio tamanho, e foi assim que
       nasceu o `11.5px` que existe em outras telas do produto.
       Quatro degraus, e todo texto desta tela sai de um deles. Ficam à vista
       aqui em vez de espalhados em classes: uma escala que você não consegue
       ler é uma escala que ninguém segue. */
    <main
      className="relative min-h-screen overflow-hidden bg-[#070b16] text-[color:var(--atlas-text-primary,#f0f4fb)]"
      style={
        {
          "--t1": "11px", // rótulo — mono, caixa alta, tracking largo
          "--t2": "13px", // corpo — campos, botões, apoio
          "--t3": "20px", // título do cartão
          "--t4": "34px", // herói
          "--r": "16px", // raio único das superfícies; a pílula é a exceção declarada
        } as CSSProperties
      }
    >
      {/* Fundo em três camadas, e nenhuma delas é imagem: um wash do acento da
          marca, o chão em grade que recua em perspectiva real (transform
          estático, custo zero de frame) e a linha do horizonte. É daqui que
          vem o "futurista" — geometria, não efeito. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1100px_520px_at_74%_-10%,color-mix(in_srgb,var(--atlas-brand-from,#3ae7d7)_10%,transparent),transparent_60%)]" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[-35%] bottom-0 h-[78%] opacity-40 [transform:perspective(820px)_rotateX(58deg)] [transform-origin:50%_100%] [background-image:linear-gradient(color-mix(in_srgb,var(--atlas-brand-from,#3ae7d7)_22%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_srgb,var(--atlas-brand-from,#3ae7d7)_22%,transparent)_1px,transparent_1px)] [background-size:54px_54px] [mask-image:linear-gradient(to_top,black_26%,transparent_92%)]"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-[36%] h-px bg-gradient-to-r from-transparent via-[color-mix(in_srgb,var(--atlas-brand-from,#3ae7d7)_28%,transparent)] to-transparent" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-[1440px] items-center gap-12 px-5 py-8 lg:grid-cols-[1.1fr_440px] lg:px-12 xl:gap-24">
        {/* ── A COLUNA DA ESQUERDA PERDEU TRÊS BLOCOS ────────────────────────
            Saíram a pastilha "IA proativa conectada ao comercial", a faixa de
            três colunas ("Prioridades agora / Copiloto único / Operação viva")
            e a faixa de rodapé de três selos. Nenhum dos três ajudava a
            entrar: numa tela de acesso a pessoa já decidiu usar o produto —
            argumento de venda ali é ruído entre ela e o campo de senha.
            Ficou o que uma capa precisa ter: quem é, o que faz, e o robô. */}
        <section className="cc5-reveal relative hidden min-h-[560px] overflow-hidden border-r border-[rgba(148,163,184,.12)] p-10 lg:flex lg:flex-col lg:justify-center xl:p-12" style={{ animationDelay: "0ms" }}>
          {/* O robô continua — ele é a IA tendo corpo, e o produto inteiro
              conversa com ela. Mudou o PAPEL: era um pôster de 380px disputando
              a tela com o texto, virou presença ao lado dele. */}
          <Image src="/brand/atlas-robot-assistant.png" alt="" aria-hidden="true" width={420} height={630} priority className="pointer-events-none absolute -bottom-6 right-0 h-[260px] w-auto select-none object-contain opacity-60 xl:h-[300px]" />
          <div className="pointer-events-none absolute bottom-10 right-10 h-16 w-44 rounded-[50%] bg-[color-mix(in_srgb,var(--atlas-brand-from,#3ae7d7)_12%,transparent)] blur-3xl" />

          <div className="relative z-10">
            <Link href="/" className="inline-flex" aria-label="Voltar para a página inicial do Atlas">
              <AtlasLogo size={52} wordmark />
            </Link>
            <h1 className="mt-10 max-w-[520px] font-semibold leading-[1.05] tracking-[-.045em] text-[length:var(--t4)]">
              Sua sala de comando para{" "}
              <span className="bg-clip-text text-transparent [background-image:linear-gradient(110deg,var(--atlas-brand-from,#3ae7d7),var(--atlas-brand-to,#8b8cff))]">decidir e vender.</span>
            </h1>
            <p className="mt-5 max-w-sm leading-6 text-[length:var(--t2)] text-[color:var(--atlas-text-secondary,#94a3b8)]">
              A IA prioriza, a equipe decide: leads, imóveis, campanhas e a próxima ação — num só lugar.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-lg">
          {/* No celular a marca aparece uma vez, com o wordmark do componente —
              e não reconstruída à mão como estava. Eram duas grafias do mesmo
              nome na MESMA tela. */}
          <div className="cc5-reveal mb-7 lg:hidden" style={{ animationDelay: "0ms" }}>
            <AtlasLogo size={46} wordmark />
          </div>

          <TiltShell delayMs={70} className="cc5-reveal relative overflow-hidden border border-[rgba(148,163,184,.16)] bg-[linear-gradient(180deg,#0f1830_0%,#0b1224_100%)] p-6 shadow-[0_40px_120px_rgba(0,0,0,.5)] sm:p-9 rounded-[calc(var(--r)*1.5)]">
            {/* A única linha de brilho da tela, e ela é de 1px: o filete no topo
                do cartão, no gradiente da marca. Um realce que você precisa
                procurar vale mais que cinco que competem. */}
            <div className="absolute inset-x-0 top-0 h-px [background:linear-gradient(90deg,transparent,var(--atlas-brand-from,#3ae7d7),var(--atlas-brand-to,#8b8cff),transparent)]" />
            <div>
              <div className="flex items-center justify-between gap-4">
                <p className="font-mono font-medium uppercase tracking-[.24em] text-[length:var(--t1)] text-[color:var(--atlas-text-tertiary,#6b7890)]">Sala de comando</p>
                <span className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1 font-mono font-medium tabular-nums text-[length:var(--t1)] ${systemStatus === "online" ? "border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-300" : systemStatus === "offline" ? "border-amber-400/15 bg-amber-400/[0.07] text-amber-300" : "border-[rgba(148,163,184,.22)] bg-white/[.04] text-slate-400"}`}><span className={`h-1.5 w-1.5 rounded-full ${systemStatus === "online" ? "bg-emerald-400" : systemStatus === "offline" ? "bg-amber-400" : "animate-pulse bg-slate-500"}`} /> {systemStatus === "online" ? "Sistema disponível" : systemStatus === "offline" ? "Conexão instável" : "Verificando"}</span>
              </div>
              <h2 className="mt-6 font-semibold tracking-[-.03em] text-[length:var(--t3)]">Bem-vindo de volta.</h2>
              <p className="mt-1.5 leading-5 text-[length:var(--t2)] text-[color:var(--atlas-text-tertiary,#6b7890)]">Entre para abrir a sua sala de comando.</p>
            </div>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
              <label className="block">
                <span className="mb-2 block font-medium text-[length:var(--t2)] text-[color:var(--atlas-text-secondary,#94a3b8)]">E-mail corporativo</span>
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
                    className="h-13 w-full border-[rgba(148,163,184,.16)] bg-white/[.03] px-4 pr-11 text-[length:var(--t2)] transition hover:border-[rgba(148,163,184,.22)] focus:border-[color:var(--atlas-brand-from,#3ae7d7)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--atlas-brand-from,#3ae7d7)_18%,transparent)]"
                    style={{ borderRadius: "var(--r)", height: "52px" }}
                    placeholder="voce@empresa.com"
                    aria-invalid={Boolean(error)}
                  />
                  {email ? <button type="button" onClick={() => { setEmail(""); emailRef.current?.focus(); }} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-500 transition hover:text-slate-200" aria-label="Limpar e-mail">×</button> : null}
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block font-medium text-[length:var(--t2)] text-[color:var(--atlas-text-secondary,#94a3b8)]">Senha</span>
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
                    className="w-full border-[rgba(148,163,184,.16)] bg-white/[.03] px-4 pr-14 text-[length:var(--t2)] transition hover:border-[rgba(148,163,184,.22)] focus:border-[color:var(--atlas-brand-from,#3ae7d7)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--atlas-brand-from,#3ae7d7)_18%,transparent)]"
                    style={{ borderRadius: "var(--r)", height: "52px" }}
                    placeholder="Digite sua senha"
                    aria-invalid={Boolean(error)}
                    aria-describedby={[capsLock ? "caps-lock-warning" : "", error ? "login-error" : ""].filter(Boolean).join(" ") || undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute inset-y-0 right-0 grid w-14 place-items-center text-slate-500 transition hover:text-[color:var(--atlas-brand-from,#3ae7d7)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--atlas-brand-from,#3ae7d7)]"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    aria-pressed={showPassword}
                    title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    <EyeIcon hidden={showPassword} />
                  </button>
                </div>
                {capsLock ? <p id="caps-lock-warning" className="mt-2 font-medium text-[length:var(--t2)] text-amber-300">Caps Lock está ativado.</p> : null}
              </label>

              <div className="flex items-center justify-between gap-4">
                <label className="flex cursor-pointer items-center gap-2.5 text-[length:var(--t2)] text-[color:var(--atlas-text-secondary,#94a3b8)]">
                  <input type="checkbox" checked={rememberEmail} onChange={(event) => setRememberEmail(event.target.checked)} className="h-4 w-4 rounded border-white/20 bg-white/5 accent-[color:var(--atlas-brand-from,#3ae7d7)]" />
                  Lembrar meu e-mail
                </label>
                <Link href="/forgot-password" className="font-medium text-[length:var(--t2)] text-[color:var(--atlas-brand-from,#3ae7d7)] transition hover:opacity-80">Esqueci minha senha</Link>
              </div>

              {error ? <div id="login-error" role="alert" aria-live="assertive" className="border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-[length:var(--t2)] text-rose-100" style={{ borderRadius: "var(--r)" }}><p className="font-semibold">Não foi possível entrar</p><p className="mt-1 leading-5 text-rose-200/90">{error}</p>{/senha|credenciais|incorretos/i.test(error) ? <Link href={`/forgot-password${email ? `?email=${encodeURIComponent(email.trim().toLowerCase())}` : ""}`} className="mt-3 inline-flex font-bold text-white underline underline-offset-4 text-[length:var(--t1)]">Redefinir minha senha</Link> : null}</div> : null}

              {/* O botão principal deixou de ser um comprimido branco. Ele é a
                  marca: mesmo gradiente do "A", texto escuro por cima. A pílula
                  é a segunda família de raio desta tela, e a única. */}
              <button type="submit" disabled={loading} aria-busy={loading} style={{ fontSize: "var(--t2)" }} className="group flex h-[52px] w-full items-center justify-center gap-2 rounded-full px-5 font-bold !text-[#06121a] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 [background:linear-gradient(110deg,var(--atlas-brand-from,#3ae7d7),var(--atlas-brand-to,#8b8cff))]">
                {loading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-black/25 border-t-black/70" aria-hidden="true" /> {loginStage === "profile" ? "Preparando sua operação..." : loginStage === "redirect" ? "Abrindo seu painel..." : "Validando acesso..."}</> : <>Entrar no Atlas OS <span aria-hidden="true">→</span></>}
              </button>
              <p className="sr-only" role="status" aria-live="polite">
                {loading ? (loginStage === "profile" ? "Acesso validado. Preparando sua operação." : loginStage === "redirect" ? "Acesso validado. Abrindo seu painel." : "Validando suas credenciais.") : "Formulário de acesso pronto."}
              </p>
              {systemStatus === "offline" ? <button type="button" onClick={() => window.location.reload()} className="w-full text-center font-semibold text-[length:var(--t2)] text-amber-200">Tentar reconectar</button> : null}
            </form>

            {/* Eram três selos ("Sessão protegida · Dados isolados · Atlas V3").
                Ficou um: o que diz algo sobre a SESSÃO que está começando. Os
                outros dois eram o produto se elogiando para quem ainda não
                entrou. */}
            <div className="mt-7 flex items-center gap-2 border-t border-[rgba(148,163,184,.12)] pt-5 font-mono font-medium uppercase tracking-[.14em] text-[length:var(--t1)] text-[color:var(--atlas-text-tertiary,#6b7890)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--atlas-brand-from,#3ae7d7)]" /> Sessão protegida · dados isolados por empresa
            </div>
          </TiltShell>
          <Link href="/" className="cc5-reveal mx-auto mt-5 flex w-fit items-center gap-2 text-[length:var(--t2)] text-[color:var(--atlas-text-tertiary,#6b7890)] transition hover:text-[color:var(--atlas-text-secondary,#94a3b8)]" style={{ animationDelay: "140ms" }}><span aria-hidden="true">←</span> Voltar para o início</Link>
        </section>
      </div>
    </main>
  );
}

/**
 * A TELA QUE APARECE QUANDO A INSTALAÇÃO NÃO FOI CONFIGURADA.
 *
 * ── Por que ela existe ──────────────────────────────────────────────────────
 *
 * Em 31/07/2026 um build de produção subiu sem `NEXT_PUBLIC_SUPABASE_URL`. O
 * valor é assado no bundle do navegador, então o cliente saiu com um endereço
 * placeholder gravado dentro. O que o usuário viu: `/login` respondendo HTTP
 * 200, **sem campo de senha**, sem explicação.
 *
 * "A tela abriu e não tem onde digitar" é indistinguível de "o sistema caiu" —
 * e manda a pessoa errada procurar a coisa errada. O corretor liga para o
 * suporte dizendo que o Atlas quebrou; o suporte procura no banco; e a causa
 * está no comando de build de três dias atrás.
 *
 * Esta tela troca isso por uma frase que aponta para a causa real. Ela não
 * conserta nada — mas faz o chamado nascer com a informação certa.
 *
 * `configuracaoEhPlaceholder()` lê os mesmos valores inlinados, sem tocar em
 * rede: se o bundle foi assado sem configuração, ela responde `true` no
 * primeiro render, antes de qualquer tentativa de conexão.
 */
function InstalacaoSemConfiguracao() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050812] p-6">
      <div className="w-full max-w-md text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Atlas One</p>
        <h1 className="mt-3 text-2xl font-semibold text-white">Esta instalação ainda não foi configurada</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          O sistema subiu, mas foi publicado sem as credenciais do banco de dados. Não é uma falha da
          sua conta e <strong className="font-semibold text-slate-300">nenhum dado foi perdido</strong> —
          é uma etapa de configuração que ficou pendente no servidor.
        </p>
        <p className="mt-4 text-xs leading-5 text-slate-500">
          Quem administra o sistema precisa definir as variáveis do Supabase e{" "}
          <strong className="font-semibold text-slate-400">construir a aplicação de novo</strong> —
          reiniciar não resolve, porque o endereço é gravado durante a construção.
        </p>
        <p className="mt-4 text-rotulo leading-5 text-slate-600">
          Diagnóstico completo em <code className="text-slate-500">/api/v1/ready</code>.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  // A verificação vem ANTES do Suspense e antes de montar o cliente do Supabase:
  // tentar autenticar contra um endereço placeholder produz exatamente a tela
  // quebrada que esta correção existe para eliminar.
  if (configuracaoEhPlaceholder()) return <InstalacaoSemConfiguracao />;

  return (
    <Suspense fallback={<main className="min-h-screen bg-[#050812]" />}>
      <LoginExperience />
    </Suspense>
  );
}
