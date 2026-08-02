"use client";

import { useCallback, useEffect, useState } from "react";
import { AtlasBadge, AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";

/**
 * A FILA DE RECUPERAÇÃO — quem volta, por qual canal, em que ordem.
 *
 * ── POR QUE ESTA TELA EXISTE ────────────────────────────────────────────────
 *
 * `lib/crm/recuperacao-da-base.ts` decide isso com 20 contratos verdes, e
 * `/api/v1/crm/reactivation` já devolvia a fila — e nada a mostrava. Módulo
 * construído e órfão é a doença que este repositório mais paga: é a mesma da IA
 * que foi construída e nunca rodou, e a dos cinco sinais de automação que
 * ficaram em zero absoluto sem ninguém ver.
 *
 * A tela de governança tinha o botão "Importar base autorizada" sem responder a
 * pergunta anterior: importar QUEM. Medido no banco em 02/08/2026, das 419 leads
 * perdidas, 252 (61%) foram descartadas como `inalcancavel` — que não é "não
 * quer", é "ligamos e não atenderam".
 *
 * ── O QUE ELA NUNCA FAZ ─────────────────────────────────────────────────────
 *
 * Desenhar ausência como zero. Quando a leitura falha, ela diz que falhou e
 * mostra o código — porque "não consegui ler as leads perdidas" e "não há lead
 * perdida" são a mesma tela vazia, e a segunda é uma boa notícia falsa.
 */

type Decisao = {
  leadId: string;
  canal: "mensagem" | "ligacao" | "nenhum";
  porque: string;
  baseLegal: string | null;
  prioridade: number;
};

type Recuperacao = {
  mensuravel: boolean;
  porqueNaoMensuravel: string | null;
  resumo: {
    avaliadas: number;
    recuperaveis: number;
    porMensagem: number;
    porLigacao: number;
    naoRecuperaveis: number;
    porqueForamExcluidas: { porque: string; quantas: number }[];
  };
  fila: Decisao[];
};

/**
 * O emoji entra pelo critério de sempre: acrescenta um canal que não existe.
 * Aqui a palavra "mensagem"/"ligação" é a ÚNICA marca hoje, e a fila é lida em
 * varredura vertical. A forma separa os dois antes da leitura.
 * `aria-hidden` porque o texto ao lado já nomeia o canal.
 */
const EMOJI_DO_CANAL: Record<string, string> = { mensagem: "💬", ligacao: "📞", nenhum: "—" };
const NOME_DO_CANAL: Record<string, string> = { mensagem: "mensagem", ligacao: "ligação", nenhum: "—" };

export function FilaDeRecuperacao() {
  const [dados, setDados] = useState<Recuperacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch("/api/v1/crm/reactivation", { cache: "no-store" });
      if (!r.ok) throw new Error(`A leitura respondeu ${r.status}.`);
      const corpo = (await r.json()) as { data?: { recuperacao?: Recuperacao } };
      const rec = corpo?.data?.recuperacao;
      if (!rec) throw new Error("A resposta não trouxe o bloco de recuperação.");
      setDados(rec);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (carregando && !dados) return <AtlasSkeleton className="h-56 w-full" />;

  if (erro) {
    return (
      <AtlasEmpty
        reason="not-configured"
        title="Não consegui ler a fila de recuperação"
        description={`${erro} Isto NÃO quer dizer que não há leads a recuperar — quer dizer que não consegui olhar.`}
      />
    );
  }

  if (!dados) return null;

  if (!dados.mensuravel) {
    return (
      <AtlasEmpty
        reason="not-configured"
        title="A fila não pôde ser medida"
        description={`A leitura das leads perdidas falhou${dados.porqueNaoMensuravel ? ` (${dados.porqueNaoMensuravel})` : ""}. Ausência de fila aqui seria uma boa notícia falsa.`}
      />
    );
  }

  const { resumo, fila } = dados;

  if (!resumo.recuperaveis) {
    return (
      <AtlasEmpty
        reason="no-results"
        title="Nenhuma lead recuperável nesta leitura"
        description={
          resumo.avaliadas
            ? `Avaliei ${resumo.avaliadas} lead(s) perdida(s) e nenhuma passou nos critérios. Os motivos estão logo abaixo.`
            : "Não há lead perdida na base."
        }
      />
    );
  }

  return (
    <div className="space-y-4 p-5">
      {/* Os três números que decidem: quantas voltam, por onde, e quantas não. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="cc6-panel-quiet p-4">
          <p className="text-rotulo font-semibold uppercase tracking-wide text-[var(--atlas-texto-fraco)]">Recuperáveis</p>
          <p className="cc6-metric-value mt-2 text-numero leading-none">{resumo.recuperaveis}</p>
          <p className="mt-1 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">de {resumo.avaliadas} lead(s) perdida(s)</p>
        </div>
        <div className="cc6-panel-quiet p-4">
          <p className="flex items-center gap-1.5 text-rotulo font-semibold uppercase tracking-wide text-[var(--atlas-texto-fraco)]">
            <span aria-hidden="true">💬</span> Por mensagem
          </p>
          <p className="cc6-metric-value mt-2 text-numero leading-none">{resumo.porMensagem}</p>
          <p className="mt-1 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">a IA abre conversa a qualquer hora</p>
        </div>
        <div className="cc6-panel-quiet p-4">
          <p className="flex items-center gap-1.5 text-rotulo font-semibold uppercase tracking-wide text-[var(--atlas-texto-fraco)]">
            <span aria-hidden="true">📞</span> Por ligação
          </p>
          <p className="cc6-metric-value mt-2 text-numero leading-none">{resumo.porLigacao}</p>
          <p className="mt-1 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">sem telefone para mensagem</p>
        </div>
      </div>

      {/* Quem ficou de fora NUNCA some: uma fila que só mostra quem entra esconde
          o critério, e critério escondido é critério que ninguém contesta. */}
      {resumo.naoRecuperaveis ? (
        <div className="cc6-panel-quiet p-4">
          <p className="text-rotulo font-semibold uppercase tracking-wide text-[var(--atlas-texto-fraco)]">
            {resumo.naoRecuperaveis} ficaram de fora
          </p>
          <ul className="mt-2 space-y-1">
            {resumo.porqueForamExcluidas.map((m) => (
              <li key={m.porque} className="flex gap-2 text-rotulo leading-5 text-[var(--atlas-texto-medio)]">
                <span className="cc6-num shrink-0 font-semibold text-[var(--atlas-texto-forte)]">{m.quantas}</span>
                <span>{m.porque}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className="space-y-2">
        {fila.slice(0, 12).map((d) => (
          <li key={d.leadId} className="cc6-panel-quiet flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3">
            <span aria-hidden="true" className="text-[0.95rem] leading-none">
              {EMOJI_DO_CANAL[d.canal] ?? "—"}
            </span>
            <span className="text-rotulo font-semibold uppercase tracking-wide text-[var(--atlas-texto-medio)]">
              {NOME_DO_CANAL[d.canal] ?? d.canal}
            </span>
            {d.baseLegal ? (
              <AtlasBadge tone="success">base declarada</AtlasBadge>
            ) : (
              <AtlasBadge tone="warning">sem base escrita</AtlasBadge>
            )}
            <span className="min-w-0 flex-1 text-rotulo leading-5 text-[var(--atlas-texto-medio)]">{d.porque}</span>
          </li>
        ))}
      </ul>

      {fila.length > 12 ? (
        <p className="text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
          Mostrando 12 de {fila.length} na fila — a rota devolve até 100 por leitura, e o corte está declarado aqui em vez
          de a lista simplesmente terminar.
        </p>
      ) : null}
    </div>
  );
}
