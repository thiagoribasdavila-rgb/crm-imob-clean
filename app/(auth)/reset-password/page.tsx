"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setReady(Boolean(data.session));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas informadas não são iguais.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError("O link pode ter expirado. Solicite uma nova recuperação de senha.");
      setLoading(false);
      return;
    }

    setUpdated(true);
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
            <p className="text-[9px] uppercase tracking-[.2em] text-slate-500">Credencial protegida</p>
          </div>
        </div>

        <p className="atlas-eyebrow">Secure credential update</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-.035em]">Defina uma nova senha.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">Use uma senha exclusiva, com no mínimo 8 caracteres.</p>

        {updated ? (
          <div className="mt-8 space-y-5">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-4 text-sm leading-6 text-emerald-100">Senha atualizada com sucesso. Seu acesso já pode ser realizado com a nova credencial.</div>
            <Link href="/login" className="atlas-button-primary block w-full py-3.5 text-center">Entrar no Atlas</Link>
          </div>
        ) : !ready ? (
          <div className="mt-8 space-y-5">
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-4 text-sm leading-6 text-amber-100">Aguardando validação do link de recuperação. Caso ele tenha expirado, solicite um novo link.</div>
            <Link href="/forgot-password" className="atlas-button-primary block w-full py-3.5 text-center">Solicitar novo link</Link>
          </div>
        ) : (
          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="block"><span className="mb-2 block text-xs font-semibold uppercase tracking-[.12em] text-slate-400">Nova senha</span><input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full px-4 py-3.5" placeholder="Mínimo de 8 caracteres" /></label>
            <label className="block"><span className="mb-2 block text-xs font-semibold uppercase tracking-[.12em] text-slate-400">Confirmar senha</span><input required minLength={8} type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="w-full px-4 py-3.5" placeholder="Repita a nova senha" /></label>
            {error ? <p className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}
            <button type="submit" disabled={loading} className="atlas-button-primary w-full py-3.5 disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Atualizando credencial..." : "Salvar nova senha"}</button>
          </form>
        )}
      </section>
    </main>
  );
}
