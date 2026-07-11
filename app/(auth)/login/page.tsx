"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
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

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError("E-mail ou senha inválidos.");
      setLoading(false);
      return;
    }

    const next = searchParams.get("next") || "/dashboard";
    router.replace(next);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-white">
      <section className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-400">
            Atlas AI
          </p>
          <h1 className="mt-3 text-3xl font-bold">Acessar o CRM</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Entre para acessar leads, pipeline, imóveis e inteligência comercial.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm text-zinc-300">E-mail</span>
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none transition focus:border-emerald-500"
              placeholder="voce@empresa.com"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-zinc-300">Senha</span>
            <input
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none transition focus:border-emerald-500"
              placeholder="••••••••"
            />
          </label>

          {error ? (
            <p className="rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
