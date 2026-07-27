"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { comPresencaDeIa } from "@/lib/ai/presence";

/**
 * SUBIR CAMPANHA COMPLETA — a agência em dois cliques.
 *
 * ── O QUE JÁ EXISTIA E NINGUÉM ALCANÇAVA ────────────────────────────────────
 *
 * `/api/v1/marketing/campaign-intake` tem 271 linhas prontas: gera a copy pelos
 * ângulos, valida política de anúncio imobiliário, sobe a mídia, monta campanha
 * → conjunto → criativo → um anúncio POR ÂNGULO, e cria tudo na Meta em PAUSED.
 *
 * Estava sem um único chamador na interface. A auditoria de rotas soltas
 * encontrou — e por isso este painel COMPÕE em vez de construir: escrever um
 * segundo orquestrador seria repetir 271 linhas testadas e criar duas formas de
 * subir campanha, que é o defeito que este projeto vem desfazendo.
 *
 * ── POR QUE DOIS CLIQUES E NÃO UM ───────────────────────────────────────────
 *
 * O primeiro clique é PRÉVIA: mostra exatamente o que será criado e o que
 * ainda falta, sem tocar na Meta. O segundo confirma com o token da prévia.
 *
 * Um clique só significaria criar estrutura de anúncio em conta de produção sem
 * ninguém ver o que vai subir. A prévia é barata; desfazer campanha errada na
 * Meta, não.
 *
 * E mesmo o segundo clique NÃO GASTA: tudo nasce PAUSED. Ativar é um terceiro
 * gesto, em outra rota, com a alçada da diretoria — porque ativar é mover verba.
 */

/**
 * Espelha o que `/api/v1/marketing/campaign-intake` devolve na prévia.
 * Conferido contra a rota, não suposto: a primeira versão deste arquivo
 * inventou `planned`/`copy[]` e teria renderizado vazio para sempre.
 */
type Previa = {
  mode?: string;
  confirmToken?: string;
  /** `angles` é 1:1 com `primaryTexts`; headlines/descriptions são um POOL
   *  que a Meta combina sozinha (Advantage+ flexível) — não pareie. */
  copy?: { angles?: string[]; primaryTexts?: string[]; headlines?: string[]; descriptions?: string[] };
  violations?: Array<{ field?: string; message?: string; reason?: string; index?: number }>;
  structure?: { steps?: number; summary?: string } | null;
  sizing?: {
    recommendedAdSets?: number;
    dailyBudgetPerAdSetBrl?: number;
    expectedConversionsPerWeek?: number;
    exitsLearning?: boolean;
    minWeeklyToExitLearningBrl?: number;
    verdict?: "verba_insuficiente" | "consolidar" | "ok" | "pode_dividir";
    reasoning?: string[];
  } | null;
  missing?: string[];
  governance?: string;
};

const VEREDITO: Record<string, string> = {
  verba_insuficiente: "⛔ Verba insuficiente para sair do aprendizado",
  consolidar: "⚠️ Consolide em menos conjuntos",
  ok: "✅ Verba coerente com a estrutura",
  pode_dividir: "✅ Dá para dividir em mais conjuntos",
};

/**
 * Os seis ângulos REAIS de `CreativeAngle`, com o nome que o corretor usa.
 *
 * A primeira versão desta lista foi escrita em inglês por suposição
 * (`location`, `lifestyle`, `investment`…) — nenhum dos seis existia, e cada
 * um derrubava a rota com 500, porque `angleCandidates` é um switch sem
 * `default`. As chaves aqui têm que casar com o tipo, não com o meu palpite.
 */
const ANGULOS = [
  { chave: "localizacao", rotulo: "📍 Localização" },
  { chave: "sair_do_aluguel", rotulo: "🔑 Sair do aluguel" },
  { chave: "investimento", rotulo: "📈 Investimento" },
  { chave: "renda_alvo", rotulo: "💳 Renda e financiamento" },
  { chave: "estilo_de_vida", rotulo: "🌿 Estilo de vida" },
  { chave: "entrega_imediata", rotulo: "🏠 Pronto para morar" },
] as const;

const rotuloDoAngulo = (chave: string) =>
  ANGULOS.find((a) => a.chave === chave)?.rotulo ?? chave;

const formatarBrl = (valor: number | undefined) =>
  valor == null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(valor);

export function CampaignIntakePanel({ empreendimentos }: { empreendimentos: string[] }) {
  const [produto, setProduto] = useState("");
  const [angulos, setAngulos] = useState<string[]>(["localizacao", "sair_do_aluguel"]);
  const [imagens, setImagens] = useState("");
  const [verbaSemanal, setVerbaSemanal] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [criado, setCriado] = useState<string | null>(null);

  const urls = imagens.split(/[\s,]+/).map((u) => u.trim()).filter(Boolean);

  async function chamar(corpo: Record<string, unknown>, rotulo: string) {
    const { data: sessao } = await supabase.auth.getSession();
    return comPresencaDeIa(rotulo, () =>
      fetch("/api/v1/marketing/campaign-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessao.session?.access_token || ""}` },
        body: JSON.stringify(corpo),
      }),
    );
  }

  async function gerarPrevia() {
    setOcupado(true); setErro(null); setCriado(null); setPrevia(null);
    try {
      const r = await chamar({
        product: produto.trim(),
        angles: angulos,
        imageUrls: urls,
        weeklyBudgetBrl: verbaSemanal ? Number(verbaSemanal) : null,
      }, `Montando a campanha de ${produto.trim() || "empreendimento"}`);
      const corpo = await r.json();
      if (r.ok) setPrevia(corpo.data);
      else setErro(corpo?.error?.message || "Não foi possível montar a prévia.");
    } catch {
      setErro("Falha de rede ao montar a prévia.");
    } finally {
      setOcupado(false);
    }
  }

  async function confirmar() {
    if (!previa?.confirmToken) return;
    setOcupado(true); setErro(null);
    try {
      const r = await chamar({
        product: produto.trim(),
        angles: angulos,
        imageUrls: urls,
        weeklyBudgetBrl: verbaSemanal ? Number(verbaSemanal) : null,
        confirmToken: previa.confirmToken,
      }, "Criando a estrutura na Meta");
      const corpo = await r.json();
      if (r.ok) { setCriado("✓ Estrutura criada na Meta, toda PAUSED. Ativar é o próximo passo, em Aprovações."); setPrevia(null); }
      else setErro(corpo?.error?.message || "Não foi possível criar.");
    } catch {
      setErro("Falha de rede ao criar.");
    } finally {
      setOcupado(false);
    }
  }

  const faltando = previa?.missing ?? [];
  const violacoes = previa?.violations ?? [];
  /**
   * Só oferecemos o botão de criar quando a criação PODE dar certo.
   * A rota recusa com 422 se faltar material (MISSING_MATERIAL) ou se a copy
   * violar política (COPY_POLICY) — oferecer um botão que já se sabe que vai
   * falhar é empurrar o erro para o usuário descobrir sozinho.
   */
  const podeCriar = Boolean(previa?.confirmToken) && !faltando.length && !violacoes.length;

  return (
    <div className="atlas-intake">
      <div className="atlas-intake-form">
        <label>
          <span>Empreendimento</span>
          <input
            list="atlas-intake-produtos"
            value={produto}
            onChange={(e) => { setProduto(e.target.value); setPrevia(null); }}
            placeholder="Inside Perdizes"
            disabled={ocupado}
          />
          <datalist id="atlas-intake-produtos">
            {empreendimentos.map((e) => <option key={e} value={e} />)}
          </datalist>
        </label>

        <label>
          <span>Verba semanal (R$)</span>
          <input
            type="number" min={0} inputMode="numeric"
            value={verbaSemanal}
            onChange={(e) => { setVerbaSemanal(e.target.value); setPrevia(null); }}
            placeholder="opcional"
            disabled={ocupado}
          />
        </label>

        <label className="atlas-intake-largo">
          <span>Imagens (uma URL por linha)</span>
          <textarea
            rows={2}
            value={imagens}
            onChange={(e) => { setImagens(e.target.value); setPrevia(null); }}
            placeholder="https://…/perspectiva.jpg"
            disabled={ocupado}
          />
        </label>

        <fieldset className="atlas-intake-largo">
          {/* Um anúncio POR ÂNGULO. É a diversidade que faz a Meta achar público
              — e o que permite descobrir qual mensagem converte, em vez de
              apostar numa só. */}
          <legend>Ângulos — um anúncio para cada</legend>
          <div className="atlas-intake-angulos">
            {ANGULOS.map((a) => (
              <label key={a.chave}>
                <input
                  type="checkbox"
                  checked={angulos.includes(a.chave)}
                  disabled={ocupado}
                  onChange={(e) => {
                    setPrevia(null);
                    setAngulos((atual) => e.target.checked
                      ? [...atual, a.chave]
                      : atual.filter((c) => c !== a.chave));
                  }}
                />
                {a.rotulo}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="atlas-intake-acoes">
        <button type="button" onClick={() => void gerarPrevia()} disabled={ocupado || !produto.trim() || !angulos.length}>
          {ocupado && !previa ? "Montando…" : "🔍 Ver o que será criado"}
        </button>
        {podeCriar ? (
          <button type="button" onClick={() => void confirmar()} disabled={ocupado} data-primario="true">
            {ocupado ? "Criando…" : "🚀 Criar na Meta (pausado)"}
          </button>
        ) : null}
      </div>

      {erro ? <p className="atlas-intake-erro">{erro}</p> : null}
      {criado ? <p className="atlas-intake-ok">{criado}</p> : null}

      {previa ? (
        <section className="atlas-intake-previa">
          <p className="atlas-intake-titulo">O que será criado</p>

          {/* `structure` só vem quando não falta nada — é o plano de execução
              real (mesmo `planFullPublication` que a criação usa), com a mídia
              simulada. Se é null, o bloco "falta" abaixo explica por quê. */}
          {previa.structure?.summary ? (
            <p className="atlas-intake-estrutura">{previa.structure.summary}</p>
          ) : null}

          {faltando.length ? (
            <div className="atlas-intake-falta">
              <p>⚠️ Falta para poder criar</p>
              {faltando.map((f) => <p key={f}>· {f}</p>)}
            </div>
          ) : null}

          {violacoes.length ? (
            <div className="atlas-intake-falta" data-bloqueio="true">
              <p>⛔ A copy viola a política de anúncio imobiliário</p>
              {violacoes.map((v, i) => (
                <p key={`${v.field ?? "copy"}-${i}`}>· {v.message ?? v.reason ?? v.field}</p>
              ))}
            </div>
          ) : null}

          {/* A verba sustenta a estrutura? É o conselho mais caro da prévia:
              conjunto que não sai do aprendizado queima verba sem otimizar. */}
          {previa.sizing?.verdict ? (
            <div className="atlas-intake-verba" data-veredito={previa.sizing.verdict}>
              <p>{VEREDITO[previa.sizing.verdict] ?? previa.sizing.verdict}</p>
              <p>
                {previa.sizing.recommendedAdSets ?? 1} conjunto(s) ·{" "}
                {formatarBrl(previa.sizing.dailyBudgetPerAdSetBrl)}/dia cada
                {previa.sizing.expectedConversionsPerWeek != null
                  ? ` · ~${previa.sizing.expectedConversionsPerWeek} conversões/semana`
                  : ""}
              </p>
              {previa.sizing.exitsLearning === false && previa.sizing.minWeeklyToExitLearningBrl != null ? (
                <p>Para sair do aprendizado: {formatarBrl(previa.sizing.minWeeklyToExitLearningBrl)}/semana por conjunto.</p>
              ) : null}
              {previa.sizing.reasoning?.map((r) => <p key={r}>{r}</p>)}
            </div>
          ) : null}

          {/* angles[i] ↔ primaryTexts[i]. Headlines e descriptions são pool:
              a Meta combina sozinha, então listamos como pool mesmo. */}
          {previa.copy?.angles?.length ? (
            <>
              <p className="atlas-intake-titulo">Um anúncio por ângulo</p>
              <ul className="atlas-intake-copy">
                {previa.copy.angles.map((a, i) => (
                  <li key={a}>
                    <strong>{rotuloDoAngulo(a)}</strong>
                    {previa.copy?.primaryTexts?.[i] ? <span>{previa.copy.primaryTexts[i]}</span> : null}
                  </li>
                ))}
              </ul>
              {previa.copy.headlines?.length ? (
                <p className="atlas-intake-pool">
                  <strong>Títulos ({previa.copy.headlines.length}):</strong>{" "}
                  {previa.copy.headlines.join(" · ")}
                </p>
              ) : null}
              {previa.copy.descriptions?.length ? (
                <p className="atlas-intake-pool">
                  <strong>Descrições ({previa.copy.descriptions.length}):</strong>{" "}
                  {previa.copy.descriptions.join(" · ")}
                </p>
              ) : null}
            </>
          ) : null}

          <p className="atlas-intake-nota">
            {previa.governance ??
              "Prévia — nada foi criado na Meta."}{" "}
            {podeCriar
              ? "Confirmar cria a estrutura pausada: nenhum centavo sai até alguém ativar, em outra tela e com alçada de diretoria."
              : "Resolva os itens acima para liberar a criação."}
          </p>
        </section>
      ) : null}
    </div>
  );
}

export default CampaignIntakePanel;
