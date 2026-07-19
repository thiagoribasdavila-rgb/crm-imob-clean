"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  clearAtlasAuthContext,
  fetchAtlasAuthContext,
} from "@/lib/auth/atlas-auth-context";

export default function SupabaseGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<"checking" | "ready" | "recoverable-error">("checking");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function checkSession() {
      setState("checking");
      try {
        const { response, context } = await fetchAtlasAuthContext(controller.signal);
        if (context) {
          setState("ready");
          return;
        }

        if (response.status === 401 || response.status === 403) {
          clearAtlasAuthContext();
          await supabase.auth.signOut({ scope: "local" });
          const next = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
          router.replace(`/login${next}`);
          return;
        }

        setState("recoverable-error");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState("recoverable-error");
      }
    }

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        clearAtlasAuthContext();
        const next = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
        router.replace(`/login${next}`);
      }
    });

    return () => {
      controller.abort();
      subscription.unsubscribe();
    };
  }, [pathname, retryKey, router]);

  if (state === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-300">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-4 text-sm shadow-2xl">
          Verificando acesso ao Atlas AI...
        </div>
      </div>
    );
  }

  if (state === "recoverable-error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-200">
        <div className="max-w-md rounded-3xl border border-white/10 bg-zinc-900/90 p-7 text-center shadow-2xl">
          <strong className="block text-lg text-white">Não foi possível preparar seu espaço agora.</strong>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Sua sessão foi preservada. O Atlas pode tentar novamente sem pedir um novo login.
          </p>
          <button
            type="button"
            className="mt-5 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-zinc-950"
            onClick={() => setRetryKey((current) => current + 1)}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
