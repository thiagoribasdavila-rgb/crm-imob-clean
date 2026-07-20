"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

const recoveryMessages: Record<string, string> = {
  recovery_link_invalid: "O link de recuperação é inválido ou expirou. Solicite um novo link.",
  missing_auth_code: "O link de recuperação não trouxe um código válido. Solicite um novo link.",
  session_exchange_failed: "Não foi possível validar sua sessão de recuperação. Solicite um novo link.",
  token_verification_failed: "Não foi possível validar o token de recuperação. Use somente o e-mail mais recente.",
  missing_auth_token: "O link de recuperação está incompleto. Solicite um novo link.",
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [routeError, setRouteError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("error");
    const suggestedEmail = params.get("email")?.trim().toLowerCase() || "";
    if (suggestedEmail.includes("@")) setEmail(suggestedEmail);
    if (code) {
      setRouteError(
        recoveryMessages[code] || "Não foi possível concluir a recuperação. Solicite um novo link.",
      );
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setError("Digite um e-mail válido para continuar.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/password-recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: normalizedEmail }) });
      const body = await response.json();
      if (!response.ok) {
        const message = String(body.error || "").toLowerCase();
        if (message.includes("rate") || message.includes("too many")) {
          setError("Muitas solicitações em sequência. Aguarde alguns minutos antes de tentar novamente.");
        } else if (message.includes("network") || message.includes("fetch")) {
          setError("Não foi possível conectar ao Atlas. Verifique sua internet e tente novamente.");
        } else {
          setError(body.error || "Não foi possível enviar o link agora.");
        }
        return;
      }

      setSent(true);
    } catch {
      setError("Ocorreu uma falha inesperada. Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#050812] px-5 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(14,165,233,.16),transparent_30rem),radial-gradient(circle_at_85%_25%,rgba(139,92,246,.14),transparent_28rem)]" />
      <section className="relative w-full max-w-lg rounded-[30px] border border-white/[0.1] bg-[#0a1020]/90 p-7 shadow-[0_40px_130px_rgba(0,0,0,.45)] backdrop-blur-2xl sm:p-10">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-400/15 font-black text-sky-300">A</span>
          <div>
            <p className="text-xl font-black">ATLAS <span className="text-sky-400">AI</span></p>
            <p className="text-[11px] font-medium text-slate-500">Recuperação segura</p>
          </div>
        </div>

        <p className="atlas-eyebrow">Identity recovery</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-.035em]">Recupere seu acesso.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">Enviaremos um link temporário para redefinir sua senha. A senha atual nunca pode ser exibida pelo sistema.</p>

        {routeError ? <div role="alert" className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-4 text-sm leading-6 text-amber-100">{routeError}</div> : null}

        {sent ? (
          <div className="mt-8 space-y-5">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-4 text-sm leading-6 text-emerald-100">
              Solicitação processada. Verifique Caixa de Entrada, Spam, Outros e Lixo Eletrônico. Use somente o e-mail mais recente.
            </div>
            <button type="button" onClick={() => { setSent(false); setError(""); }} className="atlas-button-secondary block w-full py-3.5 text-center">Enviar novamente</button>
            <Link href="/login" className="atlas-button-primary block w-full py-3.5 text-center">Voltar ao login</Link>
          </div>
        ) : (
          <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-slate-400">E-mail corporativo</span>
              <input required type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); if (error) setError(""); }} className="w-full px-4 py-3.5" placeholder="voce@empresa.com" />
            </label>
            {error ? <p role="alert" className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}
            <button type="submit" disabled={loading} className="atlas-button-primary w-full py-3.5 disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? "Enviando link seguro..." : "Enviar link de recuperação"}
            </button>
            <Link href="/login" className="block text-center text-sm text-sky-300 transition hover:text-sky-200">Voltar ao login</Link>
          </form>
        )}
      </section>
    </main>
  );
}
