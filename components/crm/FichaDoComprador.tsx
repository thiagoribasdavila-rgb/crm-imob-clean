"use client";

import { useMemo } from "react";
import {
  CAMPOS_DA_FICHA, lacunasDaFicha, normalizarFinalidade,
  type CampoDaFicha,
} from "@/lib/crm/ficha-do-comprador";

/**
 * A FICHA DO COMPRADOR — o que o corretor precisa preencher, do jeito que ele
 * pergunta.
 *
 * ── O que foi medido, e por que isto mudou ──────────────────────────────────
 *
 * 613 leads no banco vivo em 03/08/2026. Forma de pagamento, prazo de compra,
 * renda mensal e "precisa financiar": 613 vazias cada. Cem por cento.
 *
 * A causa não era desleixo: a ficha não tinha input para nenhum dos quatro, e o
 * construtor do payload não os mapeava — mesmo que a tela mandasse, o PATCH
 * descartaria, com HTTP 200 e a ficha desenhando normal.
 *
 * ── AS QUATRO DECISÕES DE FORMULÁRIO ────────────────────────────────────────
 *
 * 1. RÓTULO QUE NÃO SOME. A grade anterior identificava cada campo só pelo
 *    `placeholder`, e placeholder desaparece ao digitar: campo preenchido virava
 *    um valor sem nome. Quem revisa a ficha de outra pessoa não tinha como saber
 *    se "3" era dormitórios ou prazo.
 *
 * 2. OPÇÃO EM VEZ DE TEXTO onde a resposta é fechada. `purpose` é o único destes
 *    campos que a ingestão preenche, e o resultado medido são SEIS grafias para
 *    DOIS conceitos (morar/Moradia/moradia, investir/Investimento/investimento).
 *    Nenhum filtro agrupa isso. Texto livre em resposta fechada não é liberdade:
 *    é garantia de que ninguém conta depois.
 *
 * 3. TRÊS BLOCOS NA ORDEM DA CONVERSA. Contato, o que a pessoa quer, e só então
 *    quanto ela pode. A grade plana misturava "renda mensal" entre "nome" e
 *    "telefone", e a pergunta difícil é a primeira que se pula.
 *
 * 4. O QUE FALTA, COM A CONSEQUÊNCIA. "Preencha tudo" não move ninguém. "Sem
 *    teto de orçamento não dá para propor unidade nenhuma sem chutar" move — e
 *    a ordem é por quanto cada lacuna trava, não pela ordem do formulário.
 */

type Lead = Record<string, unknown>;

const CLASSE_CAMPO =
  "min-h-11 w-full rounded-xl border border-[var(--atlas-border)] bg-[var(--atlas-surface-subtle)] px-3 py-2.5 text-sm text-[var(--atlas-texto-forte)] outline-none transition-colors placeholder:text-[var(--atlas-texto-fraco)] focus:border-[color:var(--atlas-accent)]";

const BLOCOS = [
  { chave: "contato" as const, titulo: "Contato", nota: "Como alcançar a pessoa." },
  { chave: "perfil" as const, titulo: "O que ela procura", nota: "O que muda o argumento da conversa." },
  { chave: "capacidade" as const, titulo: "Capacidade de compra", nota: "O que decide se a proposta fecha." },
];

export function FichaDoComprador({
  lead,
  aoMudar,
}: {
  lead: Lead;
  aoMudar: (campo: string, valor: string | number | null) => void;
}) {
  const estado = useMemo(() => lacunasDaFicha(lead), [lead]);

  function renderCampo(campo: CampoDaFicha) {
    const bruto = lead[campo.coluna];
    const id = `ficha-${campo.coluna}`;
    const vazio = estado.lacunas.some((l) => l.coluna === campo.coluna);

    // A finalidade normaliza na LEITURA para que as seis grafias já gravadas
    // encontrem a opção certa no seletor. Nada é reescrito no banco por isso:
    // só o que a pessoa salvar de novo passa a valer a forma canônica.
    const valor = campo.coluna === "purpose"
      ? normalizarFinalidade(typeof bruto === "string" ? bruto : null) ?? ""
      : bruto === null || bruto === undefined ? "" : String(bruto);

    return (
      <div key={campo.coluna} className="min-w-0">
        {/* O rótulo é <label> de verdade, ligado por `htmlFor`: some do
            placeholder e passa a existir para o leitor de tela também. */}
        <label htmlFor={id} className="block text-rotulo text-[var(--atlas-texto-fraco)]">
          {campo.rotulo}
          {vazio && campo.peso === 3 ? (
            <span className="cc6-warn ml-1.5" title={campo.semEleNaoDa}>• falta</span>
          ) : null}
        </label>
        {campo.tipo === "opcao" ? (
          <select
            id={id}
            className={`${CLASSE_CAMPO} mt-1`}
            value={valor}
            onChange={(evento) => aoMudar(campo.coluna, evento.target.value || null)}
          >
            <option value="">—</option>
            {/* Valor gravado que não está entre as opções continua aparecendo:
                esconder faria a ficha mostrar "—" sobre uma resposta que o
                cliente deu, e o próximo salvamento a apagaria. */}
            {!campo.opcoes?.some((o) => o.valor === valor) && valor ? (
              <option value={valor}>{valor}</option>
            ) : null}
            {campo.opcoes?.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            className={`${CLASSE_CAMPO} mt-1`}
            type={campo.tipo === "numero" || campo.tipo === "moeda" ? "number" : "text"}
            inputMode={campo.tipo === "moeda" ? "decimal" : undefined}
            min={campo.tipo === "moeda" || campo.tipo === "numero" ? 0 : undefined}
            value={valor}
            onChange={(evento) => {
              const cru = evento.target.value;
              if (campo.tipo === "numero" || campo.tipo === "moeda") {
                aoMudar(campo.coluna, cru === "" ? null : Number(cru));
              } else {
                aoMudar(campo.coluna, cru);
              }
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      {/* ── O QUE FALTA ────────────────────────────────────────────────────── */}
      <div className="mb-4 rounded-xl border border-[var(--atlas-border-subtle)] p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-corpo leading-5 text-[var(--atlas-texto-forte)]">
            {estado.lacunas.length === 0 ? (
              <>Ficha completa. Dá para propor sem chutar nada.</>
            ) : estado.daParaPropor ? (
              <>
                Dá para propor. Faltam <span className="cc6-num font-semibold">{estado.lacunas.length}</span>{" "}
                {estado.lacunas.length === 1 ? "campo" : "campos"} que não travam a proposta.
              </>
            ) : (
              <>
                <strong className="cc6-warn">Ainda não dá para propor.</strong>{" "}
                Faltam <span className="cc6-num font-semibold">{estado.lacunas.filter((l) => l.peso === 3).length}</span>{" "}
                {estado.lacunas.filter((l) => l.peso === 3).length === 1 ? "campo que trava" : "campos que travam"}.
              </>
            )}
          </p>
          <p className="cc6-num text-rotulo text-[var(--atlas-texto-fraco)]">
            {estado.preenchidos}/{estado.total}
          </p>
        </div>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--atlas-surface-subtle)]" role="img"
          aria-label={`${estado.preenchidos} de ${estado.total} campos preenchidos.`}>
          <div
            className="h-full rounded-full transition-[width]"
            style={{
              width: `${estado.percentual}%`,
              background: estado.daParaPropor ? "var(--atlas-estado-sucesso)" : "var(--atlas-estado-atencao)",
            }}
          />
        </div>
        {/* A consequência da lacuna mais grave, escrita. Uma só: listar as dez
            devolveria a mesma parede que fez ninguém preencher nada. */}
        {estado.lacunas.length > 0 ? (
          <p className="mt-2 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
            <strong className="text-[var(--atlas-texto-medio)]">{estado.lacunas[0].rotulo}:</strong>{" "}
            {estado.lacunas[0].semEleNaoDa}
          </p>
        ) : null}
      </div>

      {/* ── OS TRÊS BLOCOS ─────────────────────────────────────────────────── */}
      {BLOCOS.map((bloco) => {
        const campos = CAMPOS_DA_FICHA.filter((c) => c.bloco === bloco.chave);
        if (!campos.length) return null;
        return (
          <fieldset key={bloco.chave} className="mb-4 last:mb-0">
            <legend className="mb-2 flex flex-wrap items-baseline gap-x-2">
              <span className="text-rotulo font-bold uppercase tracking-wider text-[var(--atlas-texto-medio)]">
                {bloco.titulo}
              </span>
              <span className="text-micro text-[var(--atlas-texto-fraco)]">{bloco.nota}</span>
            </legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {campos.map(renderCampo)}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
