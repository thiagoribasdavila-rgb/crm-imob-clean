"use client";

import Link from "next/link";
import { useEffect, useId, useState, type CSSProperties } from "react";
import { PageHeader } from "@/components/atlas/page-header";
import { AtlasSkeleton, AtlasEmpty} from "@/components/ui/AtlasUI";
import { supabase } from "@/lib/supabase";

type Result = { id: string; title: string; subtitle: string; status: string; score: number; temperature: string | null; matchedBy: string[]; reason: string; nextAction: string; href: string };

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";
const SUGESTOES = ["Perdizes", "investimento", "Meta Ads", "WhatsApp"];

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  /* `id` dentro de página é global no documento; o campo é rotulado por um
     <label for>, então o identificador precisa nascer do React. */
  const campoId = useId();

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) { setResults([]); setLoading(false); setError(""); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setError("");
      const { data } = await supabase.auth.getSession();
      const response = await fetch(`/api/v1/search?q=${encodeURIComponent(value)}`, { headers: { Authorization: `Bearer ${data.session?.access_token || ""}` }, signal: controller.signal, cache: "no-store" }).catch(() => null);
      if (!response) return;
      const body = await response.json();
      if (response.ok) setResults(body.data.results); else setError(body.error?.message || "Não foi possível buscar agora.");
      setLoading(false);
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  const curto = query.trim().length < 2;
  const tituloDaLista = curto ? "Digite para começar" : loading ? "Buscando na sua carteira" : `${results.length} resultado(s) encontrado(s)`;

  return (
    /* `data-phase` NÃO é enfeite: `scripts/check-smart-search.mjs` (portão
       `smart-search:check`, dentro de `npm run validate`) exige literalmente
       `data-phase="27-smart-search"` neste arquivo. Removê-lo derrubou o portão.
       É atributo invisível — não custa nada na tela e não é ruído. */
    <div className="space-y-4 pb-10" data-phase="27-smart-search" data-search-layout="cc6-busca">
      <PageHeader
        eyebrow="Busca inteligente"
        title="Encontre a lead pelo que você lembra."
        description="Nome, telefone, e-mail, projeto, incorporadora, corretor, origem ou intenção. O Atlas mostra por que encontrou e respeita integralmente sua carteira e hierarquia."
      />

      {/*
        O campo antigo não estava ilegível — medido dentro de
        `.atlas-app-shell`, dava 18,72:1 no claro e 17,05:1 no escuro, porque a
        regra unlayered `.atlas-app-shell input` governa o fundo de todo campo
        deste produto e nenhum `bg-*` do Tailwind chega a pintá-lo. O glifo ⌕ em
        `text-cyan-300` ficava em 4,54:1 no claro: passa raspando o piso AA, e
        passa por acidente — aquele ciano foi escolhido para fundo escuro.
        O que muda aqui é o campo deixar de ser exceção: mesma receita das
        outras telas da área, alvo de 44px, foco visível e rótulo de verdade
        (antes o `placeholder` era o único texto que dizia o que digitar).
      */}
      <section className="cc6-panel cc6-reveal p-5" aria-labelledby="search-field-title">
        <label id="search-field-title" htmlFor={campoId} className="cc6-eyebrow block">O que você lembra</label>
        <div className="mt-2 flex items-center gap-3 rounded-xl border border-[rgba(148,163,184,0.14)] bg-white/[0.03] px-4 transition-colors focus-within:border-[color:var(--atlas-accent)]">
          <span aria-hidden="true" className="text-[var(--atlas-texto-fraco)]">⌕</span>
          <input
            id={campoId}
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ex.: Perdizes, investimento, Meta Ads, Maria ou 9999"
            className={`min-h-11 min-w-0 flex-1 bg-transparent text-sm text-[var(--atlas-texto-forte)] outline-none placeholder:text-[var(--atlas-texto-fraco)] ${focusRing}`}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGESTOES.map((term) => (
            <button
              type="button"
              key={term}
              onClick={() => setQuery(term)}
              className={`cc6-ghost-btn ${focusRing}`}
            >
              {term}
            </button>
          ))}
        </div>
      </section>

      {error ? (
        <div
          role="alert"
          className="cc6-sev-band cc6-panel-quiet py-3 pl-5 pr-4 text-sm leading-6 text-[var(--atlas-estado-perigo)]"
          style={{ "--cc6-sev": "var(--atlas-danger)" } as CSSProperties}
        >
          {error}
        </div>
      ) : null}

      <section className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "60ms" }} aria-labelledby="search-results-title">
        <header className="px-5 pb-3 pt-5">
          <p className="cc6-eyebrow">Resultados sob seu escopo</p>
          <h2 id="search-results-title" className="mt-1 text-xl font-semibold tracking-tight text-[var(--atlas-texto-forte)]">{tituloDaLista}</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--atlas-texto-fraco)]">Resultados de estruturas fora do seu acesso não aparecem e não são contabilizados.</p>
        </header>

        {loading ? (
          <div className="cc6-hairline space-y-3 p-5">
            {[1, 2, 3].map((item) => <AtlasSkeleton key={item} className="h-24 w-full" />)}
          </div>
        ) : results.length ? (
          <div className="cc6-hairline grid gap-3 p-5 lg:grid-cols-2">
            {results.map((result) => (
              <Link
                href={result.href}
                key={result.id}
                className={`cc6-panel-quiet cc6-interativo-acento block p-4 ${focusRing}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <strong className="block truncate text-sm font-semibold text-[var(--atlas-texto-forte)]">{result.title}</strong>
                    {/* `--atlas-texto-fraco` dentro de `.cc6-panel-quiet` mede
                        4,35:1 no tema claro (piso AA: 4,5). O mesmo token no
                        painel de fora dá 5,84 — é o painel aninhado que come a
                        diferença. `medio` no mesmo lugar: 8,97. */}
                    <p className="mt-0.5 truncate text-rotulo leading-4 text-[var(--atlas-texto-medio)]">{result.subtitle}</p>
                  </div>
                  {/*
                    O score é RELEVÂNCIA de busca, não risco. Ele vinha pintado
                    de vermelho acima de 70 e de âmbar acima de 45 — ou seja, o
                    resultado mais parecido com o que a pessoa procurava era
                    desenhado como o mais perigoso. O número continua; a
                    severidade emprestada sai.
                  */}
                  <span className="cc6-chip shrink-0 [font-variant-numeric:tabular-nums]">{result.score} PTS</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {result.matchedBy.map((reason) => <span key={reason} className="cc6-chip">{reason.toUpperCase()}</span>)}
                  <span className="cc6-chip">{result.status.toUpperCase()}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--atlas-texto-medio)]">{result.reason}</p>
                <p className="mt-2 text-sm font-semibold text-[color:var(--atlas-accent-hover)]">{result.nextAction} →</p>
              </Link>
            ))}
          </div>
        ) : (
          /* Volta ao componente compartilhado — mesma nota de notifications.
               Aqui o `reason` ainda separa DOIS vazios que a versão à mão
               tratava como um: "você não digitou o bastante" e "procurei e não
               achei" pedem ações diferentes de quem lê. */
            <AtlasEmpty
              reason={curto ? "first-use" : "no-results"}
              title={curto ? "Busca pronta" : "Nenhuma lead encontrada"}
              description={
                curto
                  ? "Digite pelo menos dois caracteres para pesquisar sua carteira."
                  : "Tente parte do telefone, outro projeto, a origem ou a intenção registrada. Resultados fora do seu escopo permanecem ocultos."
              }
            />
        )}
      </section>
    </div>
  );
}
