"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const recoveryMessages: Record<string, string> = {
  recovery_link_invalid: "O link de recuperação é inválido ou expirou. Solicite um novo link abaixo.",
  session_exchange_failed: "Não foi possível validar o link. Solicite uma nova recuperação de senha.",
  token_verification_failed: "O token de recuperação já foi usado ou expirou. Gere um novo link.",
  missing_auth_token: "O link recebido está incompleto. Solicite um novo e-mail de recuperação.",
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("error");
    if (reason) setError(recoveryMessages[reason] ?? "Não foi possível validar o link de recuperação.");
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cooldown > 0) return;

    setLoading(true);
    setError("");

    const normalizedEmail = email.trim().toLowerCase();
    const origin = window.location.origin;
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo,
    });

    if (resetError) {
      const rateLimited = resetError.status === 429 || resetError.message.toLowerCase().includes("rate");
      setError(
        rateLimited
          ? "Muitas solicitações em pouco tempo. Aguarde alguns minutos antes de tentar novamente."
          : "Não foi possível iniciar a recuperação. Confira o e-mail e tente novamente.",
      );
      setLoading(false);
      return;
    }

    setSent(true);
    setCooldown(60);
    setLoading(false);
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#050812] px-5 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(14,165,233,.16),transparent_30rem),radial-gradient(circle_at_85%_25%,rgba(139,92,246,.14),transparent_28rem)]" />
      <section className="relative w-full max-w-lg rounded-[30px] border border-white/[0.1] bg-[#0a1020]/90 p-7 shadow-[0_40px_130px_rgba(0,0,0,.45)] backdrop-blur-2xl sm:p-10">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-400/15 font-black text-sky-300">A</span>
          <div>
            <p className="text-xl font-black">ATLAS <span className="text-sky-400">AI</span></p>
            <p className="text-[9px] uppercase tracking-[.2em] text-slate-500">Recuperação segura</p>
          </div>
        </div>

        <p className="atlas-eyebrow">Identity recovery</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-.035em]">Recupere seu acesso.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">Enviaremos um link temporário para redefinir a senha da sua conta Atlas.</p>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[.12em] text-slate-400">E-mail corporativo</span>
            <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full px-4 py-3.5" placeholder="voce@empresa.com" />
          </label>

          {error ? <p className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm leading-6 text-rose-200">{error}</p> : null}

          {sent ? (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-4 text-sm leading-6 text-emerald-100">
              Solicitação aceita. Verifique Caixa de Entrada, Lixo Eletrônico, Spam e Outros. Use somente o e-mail mais recente.
            </div>
          ) : null}

          <button type="submit" disabled={loading || cooldown > 0} className="atlas-button-primary w-full py-3.5 disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? "Enviando link seguro..." : cooldown > 0 ? `Reenviar em ${cooldown}s` : sent ? "Reenviar link" : "Enviar link de recuperação"}
          </button>

          <Link href="/login" className="block text-center text-sm text-sky-300 transition hover:text-sky-200">Voltar ao login</Link>
        </form>
      </section>
    </main>
  );
}
