"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type SetupResult = {
  status?: string;
  organizationId?: string;
  message?: string;
  error?: string;
};

export default function SetupPage() {
  const [organizationName, setOrganizationName] = useState("Atlas One");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [bootstrapSecret, setBootstrapSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SetupResult | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    if (password !== passwordConfirmation) {
      setError("As senhas precisam ser iguais.");
      return;
    }
    if (bootstrapSecret.trim().length < 32) {
      setError("Informe o segredo temporário de ativação com pelo menos 32 caracteres.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/bootstrap/admin", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "x-atlas-bootstrap-secret": bootstrapSecret.trim(),
        },
        body: JSON.stringify({
          organizationName: organizationName.trim(),
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as SetupResult;
      if (response.status === 409) {
        setBootstrapSecret("");
        setPassword("");
        setPasswordConfirmation("");
        setResult({ status: "locked" });
        return;
      }
      if (!response.ok) throw new Error(body.error || "Não foi possível concluir a ativação.");
      setBootstrapSecret("");
      setPassword("");
      setPasswordConfirmation("");
      setResult(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir a ativação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#03060b] px-5 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_12%,rgba(14,165,233,.17),transparent_34rem),radial-gradient(circle_at_85%_78%,rgba(99,102,241,.11),transparent_30rem)]" />
      <div className="relative mx-auto grid w-full max-w-6xl gap-10 lg:min-h-[calc(100vh-5rem)] lg:grid-cols-[.9fr_1.1fr] lg:items-center">
        <section>
          <Link href="/" className="inline-flex items-center gap-3" aria-label="Voltar ao início">
            <span className="grid h-12 w-12 place-items-center rounded-2xl border border-sky-300/20 bg-sky-400/[.09] text-lg font-black text-sky-200">A</span>
            <div>
              <p className="text-2xl font-black tracking-[-.04em]">ATLAS <span className="text-sky-400">ONE</span></p>
              <p className="text-[10px] font-semibold uppercase tracking-[.23em] text-slate-500">Primeiro acesso protegido</p>
            </div>
          </Link>
          <p className="mt-12 text-xs font-bold uppercase tracking-[.18em] text-sky-300">Instalação limpa</p>
          <h1 className="mt-5 max-w-xl text-5xl font-semibold leading-[.98] tracking-[-.06em] sm:text-6xl">
            Prepare a primeira operação do Atlas.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-slate-400">
            Crie a organização e o administrador inicial. A ativação funciona uma única vez e não inclui dados, usuários ou leads fictícios.
          </p>
          <div className="mt-8 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
            {["Base comercial vazia", "Permissões preservadas", "Sem custo adicional"].map((item) => (
              <div key={item} className="rounded-2xl border border-white/[.08] bg-white/[.025] px-4 py-4">{item}</div>
            ))}
          </div>
        </section>

        <section className="rounded-[32px] border border-white/[.09] bg-[#070d15]/95 p-6 shadow-[0_40px_120px_rgba(0,0,0,.55)] backdrop-blur-2xl sm:p-9">
          {result ? (
            <div role="status" className="py-4">
              <span className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/[.08] px-3 py-1 text-xs font-bold uppercase tracking-[.14em] text-emerald-300">
                {result.status === "locked" ? "Ambiente protegido" : "Ativação concluída"}
              </span>
              <h2 className="mt-6 text-3xl font-semibold tracking-[-.04em]">
                {result.status === "locked" ? "Instalação já concluída" : "Administrador preparado."}
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                {result.status === "locked"
                  ? "O primeiro administrador já existe. Novos usuários devem ser criados dentro da área administrativa do Atlas One."
                  : "Entre no Atlas e valide o painel. Em seguida, remova o segredo temporário de ativação da Hostinger e reinicie a aplicação."}
              </p>
              {result.organizationId ? (
                <div className="mt-6 rounded-2xl border border-white/[.08] bg-black/20 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[.15em] text-slate-500">Organization ID</p>
                  <p className="mt-2 break-all font-mono text-xs text-slate-300">{result.organizationId}</p>
                </div>
              ) : null}
              <Link href="/login" className="mt-7 flex h-13 items-center justify-center rounded-full bg-white px-6 text-sm font-bold !text-slate-950 transition hover:bg-sky-100">
                Entrar no Atlas One →
              </Link>
            </div>
          ) : (
            <>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">Ativação de uso único</p>
                <h2 className="mt-4 text-3xl font-semibold tracking-[-.04em]">Criar ambiente inicial</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">Nenhuma senha ou chave será salva no navegador.</p>
              </div>
              <form className="mt-7 space-y-4" onSubmit={handleSubmit} noValidate>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-slate-400">Organização</span>
                    <input required maxLength={120} value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} className="h-13 w-full border-white/10 bg-white/[.03] px-4" placeholder="Nome da empresa" />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-slate-400">Administrador</span>
                    <input required maxLength={120} autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} className="h-13 w-full border-white/10 bg-white/[.03] px-4" placeholder="Nome completo" />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-slate-400">E-mail corporativo</span>
                  <input required type="email" inputMode="email" autoComplete="username" autoCapitalize="none" value={email} onChange={(event) => setEmail(event.target.value)} className="h-13 w-full border-white/10 bg-white/[.03] px-4" placeholder="voce@empresa.com" />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-slate-400">Senha inicial</span>
                    <input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-13 w-full border-white/10 bg-white/[.03] px-4" placeholder="12+ caracteres" />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-slate-400">Confirmar senha</span>
                    <input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} className="h-13 w-full border-white/10 bg-white/[.03] px-4" placeholder="Repita a senha" />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-slate-400">Segredo temporário de ativação</span>
                  <input required type="password" minLength={32} autoComplete="off" value={bootstrapSecret} onChange={(event) => setBootstrapSecret(event.target.value)} className="h-13 w-full border-white/10 bg-white/[.03] px-4 font-mono" placeholder="Segredo configurado no servidor" />
                </label>
                <p className="text-xs leading-5 text-slate-600">A senha deve ter 12 a 128 caracteres e combinar ao menos três tipos: maiúsculas, minúsculas, números e símbolos.</p>
                {error ? <p role="alert" className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
                <button type="submit" disabled={loading} aria-busy={loading} className="flex h-14 w-full items-center justify-center rounded-full bg-white px-6 text-sm font-bold !text-slate-950 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60">
                  {loading ? "Preparando ambiente..." : "Criar primeira organização"}
                </button>
              </form>
            </>
          )}
          <Link href="/login" className="mx-auto mt-6 block w-fit text-xs text-slate-600 transition hover:text-slate-300">Já tenho acesso</Link>
        </section>
      </div>
    </main>
  );
}
