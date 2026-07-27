"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState(false);

  /**
   * ── DOIS DEFEITOS QUE IMPEDIAM A TROCA DE SENHA ──────────────────────────
   *
   * O corretor abria o link e a tela nunca pedia a senha nova.
   *
   * 1. CORRIDA. A Supabase entrega o token de recuperação no FRAGMENTO da URL
   *    (#access_token=…&type=recovery), que o navegador nunca envia ao
   *    servidor. O cliente do navegador troca esse fragmento por sessão de
   *    forma assíncrona — e esta tela perguntava ao servidor ANTES disso
   *    terminar. O servidor respondia 401 e a tela desistia para sempre.
   *
   *    Agora esperamos a sessão do navegador primeiro. É ela que existe de
   *    verdade nesse momento.
   *
   * 2. NAVEGADOR DIFERENTE. O cookie `atlas-recovery-intent` é gravado no
   *    navegador que PEDIU o reset. Quem pede no computador e abre o e-mail no
   *    celular nunca tinha esse cookie — e era barrado sem explicação.
   *
   *    Sessão de recuperação válida basta. O cookie deixa de ser exigência e
   *    volta a ser o que é: um reforço, não o portão.
   */
  useEffect(() => {
    let active = true;

    async function liberar() {
      // 1) A sessão do NAVEGADOR é a que carrega o token do fragmento.
      //    `onAuthStateChange` entrega PASSWORD_RECOVERY assim que a troca
      //    termina; `getSession` cobre o caso de já ter terminado antes de nós.
      const { data: agora } = await supabase.auth.getSession();
      if (!active) return;
      if (agora.session) {
        setReady(true);
        setChecking(false);
        return;
      }

      // 2) Ainda não terminou: escuta o evento em vez de concluir que falhou.
      const { data: sub } = supabase.auth.onAuthStateChange((evento, sessao) => {
        if (!active) return;
        if (sessao && (evento === "PASSWORD_RECOVERY" || evento === "SIGNED_IN" || evento === "INITIAL_SESSION")) {
          setReady(true);
          setChecking(false);
          sub.subscription.unsubscribe();
        }
      });

      // 3) Prazo para a troca acontecer. Sem isto a tela ficaria "verificando"
      //    para sempre num link de fato inválido.
      setTimeout(async () => {
        if (!active) return;
        const { data: ultima } = await supabase.auth.getSession();
        if (ultima.session) { setReady(true); setChecking(false); return; }
        // Último recuo: o caminho antigo, para o link que criou sessão só no
        // servidor. Se também falhar, aí sim o link não presta.
        const r = await fetch("/api/auth/password-reset", { cache: "no-store" }).catch(() => null);
        if (!active) return;
        setReady(Boolean(r?.ok));
        if (!r?.ok) setError("O link expirou, já foi utilizado ou não criou uma sessão de recuperação. Peça um novo.");
        setChecking(false);
        sub.subscription.unsubscribe();
      }, 3000);
    }

    void liberar().catch(() => {
      if (!active) return;
      setError("Não foi possível validar o link de recuperação.");
      setChecking(false);
    });

    return () => { active = false; };
  }, []);

  const strength = useMemo(() => {
    const categories = [/[a-z]/.test(password), /[A-Z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length;
    return { categories, valid: password.length >= 12 && password.length <= 128 && categories >= 3 };
  }, [password]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!strength.valid) {
      setError("Use 12 a 128 caracteres e combine ao menos três tipos: maiúsculas, minúsculas, números e símbolos.");
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas informadas não são iguais.");
      return;
    }

    setLoading(true);
    // A troca vai pela SESSÃO DO NAVEGADOR, que é a que carrega o token do
    // fragmento. A rota do servidor exige o cookie `atlas-recovery-intent`, que
    // só existe no navegador que PEDIU o reset — quem abre o e-mail no celular
    // não o tem, e levaria erro depois de digitar a senha inteira.
    //
    // Liberar a tela e barrar o envio seria pior que barrar antes: o corretor
    // faz o trabalho e perde.
    const { data: sessao } = await supabase.auth.getSession();
    if (sessao.session) {
      const { error: erroTroca } = await supabase.auth.updateUser({ password });
      if (erroTroca) {
        setError(erroTroca.message || "Não foi possível trocar a senha. Peça um novo link.");
        setLoading(false);
        return;
      }
      // A rota do servidor ainda é chamada para limpar o cookie de intenção e
      // registrar a troca — falha aqui não desfaz a senha já alterada.
      await fetch("/api/auth/password-reset", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      }).catch(() => {});
    } else {
      const response = await fetch("/api/auth/password-reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error || "O link expirou ou já foi utilizado. Solicite uma nova recuperação de senha.");
        setLoading(false);
        return;
      }
    }
    setPassword(""); setConfirmPassword("");
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
            <p className="text-[11px] font-medium text-slate-500">Credencial protegida</p>
          </div>
        </div>

        <p className="atlas-eyebrow">Secure credential update</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-.035em]">Defina uma nova senha.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">Use uma senha exclusiva, com 12 a 128 caracteres e ao menos três tipos de caractere.</p>

        {updated ? (
          <div className="mt-8 space-y-5">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-4 text-sm leading-6 text-emerald-100">Senha atualizada com sucesso. Entre novamente com a nova credencial.</div>
            <Link href="/login" className="atlas-button-primary block w-full py-3.5 text-center">Entrar no Atlas</Link>
          </div>
        ) : checking ? (
          <div className="mt-8 rounded-2xl border border-sky-400/20 bg-sky-400/10 px-4 py-4 text-sm leading-6 text-sky-100">Validando o link seguro de recuperação...</div>
        ) : !ready ? (
          <div className="mt-8 space-y-5">
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-4 text-sm leading-6 text-amber-100">O link é inválido, expirou ou não criou uma sessão de recuperação.</div>
            {error ? <p className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}
            <Link href="/forgot-password" className="atlas-button-primary block w-full py-3.5 text-center">Solicitar novo link</Link>
          </div>
        ) : (
          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="block"><span className="mb-2 block text-xs font-medium text-slate-400">Nova senha</span><input required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={password} onChange={(event) => { setPassword(event.target.value); if(error)setError(""); }} className="w-full px-4 py-3.5" placeholder="12+ caracteres e 3 tipos" aria-describedby="password-strength" /><span id="password-strength" className={`mt-2 block text-xs ${strength.valid?"text-emerald-300":"text-slate-500"}`}>{strength.valid?"Senha atende à política.":`${password.length}/12+ caracteres · ${strength.categories}/3 tipos`}</span></label>
            <label className="block"><span className="mb-2 block text-xs font-medium text-slate-400">Confirmar senha</span><input required minLength={12} type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="w-full px-4 py-3.5" placeholder="Repita a nova senha" /></label>
            {error ? <p role="alert" aria-live="assertive" className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p> : null}
            <button type="submit" disabled={loading} className="atlas-button-primary w-full py-3.5 disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Atualizando credencial..." : "Salvar nova senha"}</button>
          </form>
        )}
      </section>
    </main>
  );
}
