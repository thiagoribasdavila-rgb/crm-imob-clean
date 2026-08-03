"use client";

/**
 * A FAIXA DE COMANDO — a primeira tela da Sala de Comando, v3.
 *
 * ── O que foi medido na tela antiga, em 03/08/2026 ─────────────────────────
 *
 *   41 painéis em 6 larguras distintas (353 e 355 lado a lado)
 *   6 colunas de alinhamento diferentes
 *   2 raios de canto convivendo (12px em 15 painéis, 16px em 26)
 *   13 tamanhos de fonte
 *   página com 9.515px = 10,6 telas
 *   os 3 maiores números da primeira tela — 5, 50 e R$ 3.792 — todos a 44px
 *
 * O último item é o que mais custa: nada distingue "5 decisões esperando você"
 * de "R$ 3.792 gastos". E a linha que decide o dia aparecia a 16px.
 *
 * ── As três regras desta faixa ─────────────────────────────────────────────
 *
 * 1. UMA GRADE. Todo cartão nasce da mesma coluna, com o mesmo raio. Dois
 *    pixels de diferença de largura o olho lê como torto sem saber dizer por
 *    quê — e era isso que fazia a tela parecer desconfigurada.
 *
 * 2. TAMANHO PROPORCIONAL À CONSEQUÊNCIA. O herói é o que exige decisão. Gasto
 *    e telemetria são auditoria: descem de degrau. A escala é a declarada em
 *    globals.css (10·11·13·20·34) — nada de valor arbitrário.
 *
 * 3. O EMOJI É CANAL, NÃO ENFEITE. Ele entra pelo mesmo critério que a tela de
 *    saúde operacional já provou: quando a cor sozinha não distingue estados,
 *    a forma distingue — e sobrevive em escala de cinza e para quem não separa
 *    matizes. Cada glifo aponta para a AÇÃO, não para o assunto. Cartão sem
 *    ação distinta fica sem glifo de propósito: se todos têm, nenhum informa.
 *
 * ── O que esta faixa NÃO faz ───────────────────────────────────────────────
 *
 * Não inventa número. Cada cartão vem de `/api/v1/atlas/sala/cartoes` com uma
 * `Medida` cujo `valor: null` significa "não consegui ler" — e isso é desenhado
 * como tal, jamais como zero. Zero é afirmação sobre o mundo.
 *
 * E não gera resposta: a pergunta digitada é resolvida contra o catálogo
 * declarado. Se nada casa, a faixa diz que não entendeu e oferece o que sabe.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Medida = { valor: number | null; comoFoiMedido: string; motivoSemMedida?: string };
type Acao = { rotulo: string; href: string };
type Cartao = {
  id: string;
  titulo: string;
  responde: string;
  acoes: Acao[];
  medida: Medida;
  recorte: string;
  contexto?: { rotulo: string; valor: number | null } | null;
};
type Pergunta = { id: string; titulo: string; responde: string };

/**
 * O glifo por AÇÃO, não por assunto.
 *
 * `mornas` e `quentes` ficam sem glifo de propósito: são recortes de leitura,
 * não pedidos de ação. Marcar todos transformaria o glifo em textura.
 */
const GLIFO: Record<string, string> = {
  "perdidas-sem-contato": "🕳️", // o buraco por onde a operação vaza
  "sem-primeiro-contato": "⏱️", // prazo correndo
  "mornas-sem-contato": "📞", // ligue
  "decisoes-pendentes": "✍️", // assine
  "criativos-esperando": "🚀", // pode ir ao ar
};

const NUMERO = new Intl.NumberFormat("pt-BR");

/** Barra de proporção — só desenha quando há denominador REAL. */
function Proporcao({ parte, total }: { parte: number; total: number }) {
  if (!Number.isFinite(parte) || !Number.isFinite(total) || total <= 0) return null;
  const pct = Math.max(0, Math.min(100, Math.round((parte / total) * 100)));
  return (
    <div className="mt-3">
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-[var(--atlas-border)]"
        role="img"
        aria-label={`${pct}% de ${NUMERO.format(total)}`}
      >
        <div className="h-full rounded-full bg-[var(--atlas-accent)]" style={{ width: `${pct}%` }} />
      </div>
      <p className="cc6-num mt-1.5 text-micro text-[var(--atlas-texto-fraco)]">
        {pct}% de {NUMERO.format(total)}
      </p>
    </div>
  );
}

export function FaixaDeComando() {
  const [cartoes, setCartoes] = useState<Cartao[] | null>(null);
  const [catalogo, setCatalogo] = useState<Pergunta[]>([]);
  const [erro, setErro] = useState("");
  const [texto, setTexto] = useState("");
  const [foco, setFoco] = useState<string | null>(null);
  const [naoEntendi, setNaoEntendi] = useState<Pergunta[] | null>(null);

  const carregar = useCallback(async () => {
    const sessao = await supabase.auth.getSession();
    const r = await fetch("/api/v1/atlas/sala/cartoes", {
      headers: { Authorization: `Bearer ${sessao.data.session?.access_token || ""}` },
      cache: "no-store",
    });
    const corpo = await r.json().catch(() => null);
    if (!r.ok) {
      // 503 vira frase, não lista vazia: "nenhum indicador" seria uma
      // tranquilidade fabricada por falha de leitura.
      setErro(corpo?.error?.message || "Não foi possível ler os indicadores agora.");
      setCartoes(null);
      return;
    }
    const dados = corpo?.data ?? corpo;
    setCartoes(Array.isArray(dados?.cartoes) ? dados.cartoes : []);
    setCatalogo(Array.isArray(dados?.perguntasQueSeiResponder) ? dados.perguntasQueSeiResponder : []);
    setErro("");
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  async function perguntar(valor: string) {
    const pergunta = valor.trim();
    if (!pergunta) return;
    const sessao = await supabase.auth.getSession();
    const r = await fetch("/api/v1/atlas/sala/cartoes", {
      method: "POST",
      headers: { Authorization: `Bearer ${sessao.data.session?.access_token || ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pergunta }),
    });
    const corpo = await r.json().catch(() => null);
    const resposta = (corpo?.data ?? corpo)?.resposta;
    if (!resposta || resposta.tipo === "nao_entendi") {
      setFoco(null);
      setNaoEntendi(resposta?.sugestoes ?? catalogo.slice(0, 4));
      return;
    }
    setNaoEntendi(null);
    setFoco(resposta.tipo === "entendi" ? resposta.intencao.id : resposta.candidatas?.[0]?.id ?? null);
  }

  const visiveis = useMemo(() => {
    if (!cartoes) return [];
    return foco ? cartoes.filter((c) => c.id === foco) : cartoes;
  }, [cartoes, foco]);

  /** O maior denominador disponível dá contexto sem inventar total. */
  const totalDaBase = useMemo(
    () => cartoes?.find((c) => c.contexto?.valor != null)?.contexto?.valor ?? null,
    [cartoes],
  );

  return (
    <section className="cc6-panel space-y-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="cc6-eyebrow">O que você quer saber</p>
        {foco ? (
          <button type="button" onClick={() => { setFoco(null); setTexto(""); }} className="cc6-ghost-btn">
            Ver tudo
          </button>
        ) : null}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); void perguntar(texto); }}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="quantas perdidas sem contato?"
          aria-label="Pergunte à Sala de Comando"
          className="min-h-11 flex-1 rounded-xl px-3 text-corpo"
        />
        <button type="submit" className="atlas-button-primary px-4 py-2 text-rotulo">
          Perguntar
        </button>
      </form>

      {naoEntendi ? (
        <div className="cc6-panel-quiet space-y-2 p-3">
          {/* Não entender é resposta legítima. O erro caro desta direção seria
              devolver o cartão mais parecido e deixar a pessoa decidir em cima
              do número errado. */}
          <p className="text-corpo leading-6 text-[var(--atlas-texto-medio)]">
            Não entendi essa. Estas eu sei responder:
          </p>
          <div className="flex flex-wrap gap-2">
            {naoEntendi.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setTexto(p.titulo); void perguntar(p.titulo); }}
                className="cc6-ghost-btn"
              >
                {p.titulo}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {erro ? (
        <p className="text-corpo leading-6 text-[var(--atlas-texto-medio)]">{erro}</p>
      ) : cartoes === null ? (
        <p className="text-corpo leading-6 text-[var(--atlas-texto-fraco)]">Lendo os indicadores…</p>
      ) : (
        /* UMA GRADE: mesma coluna, mesmo gap, para todos. É o que faz a tela
           parar de parecer desconfigurada — 41 painéis em 6 larguras eram a
           causa medida. */
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visiveis.map((c) => {
            const naoMedido = c.medida.valor === null;
            return (
              <article key={c.id} className="cc6-panel-quiet flex flex-col justify-between gap-3 p-4">
                <div>
                  <p className="cc6-eyebrow text-micro!">
                    {GLIFO[c.id] ? <span aria-hidden="true">{GLIFO[c.id]} </span> : null}
                    {c.titulo}
                  </p>

                  {naoMedido ? (
                    /* NUNCA zero. `null` é afirmação sobre a leitura; zero seria
                       afirmação sobre o mundo — e "0 leads sem contato" leria
                       como tranquilidade justamente quando não se sabe. */
                    <p className="mt-2 text-corpo leading-6 text-[var(--atlas-texto-medio)]">
                      {c.medida.motivoSemMedida ?? "não foi possível medir agora"}
                    </p>
                  ) : (
                    <p className="cc6-num mt-2 text-heroi leading-none text-[var(--atlas-texto-forte)]">
                      {NUMERO.format(c.medida.valor as number)}
                    </p>
                  )}

                  <p className="mt-2 text-corpo leading-6 text-[var(--atlas-texto-medio)]">{c.responde}</p>

                  {/* O RECORTE FICA VISÍVEL. É o que impede o cartão dizer 463 e
                      a lista mostrar 50 sem ninguém entender por quê. */}
                  <p className="cc6-num mt-1.5 text-micro text-[var(--atlas-texto-fraco)]">{c.recorte}</p>

                  {!naoMedido && c.contexto?.valor != null ? (
                    <Proporcao parte={c.medida.valor as number} total={c.contexto.valor} />
                  ) : !naoMedido && totalDaBase && c.id !== "sem-primeiro-contato" ? null : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {c.acoes.map((a) => (
                    <a key={a.href} href={a.href} className="cc6-ghost-btn">
                      {a.rotulo}
                    </a>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
