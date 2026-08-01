"use client";

/**
 * CAPTURAR A RESPOSTA DA PERGUNTA DECISIVA, NO LUGAR ONDE ELA É FEITA.
 *
 * ── O QUE ESTAVA FALTANDO, MEDIDO ───────────────────────────────────────────
 *
 * Medido na organização real em 2026-07-30:
 *
 *   leads .............................................. 482
 *   com bairro declarado ................................. 6
 *   com dormitórios ..................................... 12
 *   com faixa de preço ................................... 9
 *   com SLA de 1º contato VENCIDO e sem contato registrado  473
 *   notas escritas por humano nas 469 sem critério ....... 4
 *
 * E a causa: **nenhuma tela do CRM permite gravar `preferred_neighborhoods` ou
 * `preferred_bedrooms` numa lead existente**. Os três campos decisivos só
 * aparecem no formulário de cadastro (`leads/new`). O corretor recebia a lead da
 * Meta sem nenhum deles, via a pergunta na tela — e não tinha onde escrever a
 * resposta que acabara de ouvir no telefone.
 *
 * Por isso os 13 leads com critério são exatamente os 11 com nota humana: o dado
 * só existia onde alguém digitou à mão, em texto livre, onde o motor não lê.
 *
 * ── POR QUE SALVAR UM CAMPO POR VEZ SÓ FICOU SEGURO AGORA ───────────────────
 *
 * Até hoje, um PATCH parcial gravava `null` em nome, e-mail, telefone e origem.
 * Salvar só o bairro apagaria o telefone da pessoa. O `sent()` em
 * `lib/compat/payload-de-lead.ts` fechou isso, com contrato e prova de mutação —
 * este componente depende daquela correção e não pode ser usado sem ela.
 *
 * ── A ARMADILHA DO NOME DO CAMPO ────────────────────────────────────────────
 *
 * O corpo do PATCH usa `preferred_regions`, e o banco guarda em
 * `preferred_neighborhoods`. Quem mandar `preferred_neighborhoods` no corpo vê a
 * requisição responder 200 e o dado não mudar: `liveLeadUpdatePayload` só olha
 * `sent("preferred_regions")`. Silêncio com cara de sucesso.
 */

import { useState } from "react";

import { supabase } from "@/lib/supabase";

type Props = {
  leadId: string;
  chave: string;
  /** Recarrega a compatibilidade: a resposta muda o que o motor recomenda. */
  aoSalvar: () => void;
};

/** Só os três decisivos. Perguntar o resto sem estes é gastar o toque à toa. */
const CAMPOS: Record<
  string,
  { rotulo: string; dica: string; corpo: (valor: string, ate: string) => Record<string, unknown> | null }
> = {
  bairro: {
    rotulo: "Bairros que ele pediu",
    dica: "Perdizes, Pompeia",
    corpo: (valor) => {
      const lista = valor
        .split(/[,;/]+/)
        .map((parte) => parte.trim())
        .filter(Boolean)
        .slice(0, 20);
      // `preferred_regions` é a chave do CORPO; o banco grava em
      // `preferred_neighborhoods`. Ver o comentário do topo.
      return lista.length ? { preferred_regions: lista } : null;
    },
  },
  dormitorios: {
    rotulo: "Dormitórios que ele precisa",
    dica: "2",
    corpo: (valor) => {
      const n = Number(valor.replace(/\D/g, ""));
      return Number.isFinite(n) && n >= 0 && n <= 20 ? { bedrooms: n } : null;
    },
  },
  faixaDePreco: {
    rotulo: "Faixa de valor que ele aceita",
    dica: "300000",
    corpo: (de, ate) => {
      const num = (v: string) => {
        const limpo = v.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
        const n = Number(limpo);
        return Number.isFinite(n) && n > 0 ? n : null;
      };
      const min = num(de);
      const max = num(ate);
      if (min === null && max === null) return null;
      // Só o que foi digitado vai no corpo: mandar o outro como null apagaria um
      // limite que o cliente já tinha declarado antes.
      const corpo: Record<string, unknown> = {};
      if (min !== null) corpo.budget_min = min;
      if (max !== null) corpo.budget_max = max;
      return corpo;
    },
  },
};

export function CapturaDeRespostaDecisiva({ leadId, chave, aoSalvar }: Props) {
  const campo = CAMPOS[chave];
  const [valor, setValor] = useState("");
  const [ate, setAte] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  if (!campo) return null;

  const corpo = campo.corpo(valor, ate);

  async function salvar() {
    if (!corpo) return;
    setSalvando(true);
    setErro(null);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) {
      setErro("Sessão expirada. Entre novamente.");
      setSalvando(false);
      return;
    }
    try {
      const res = await fetch(`/api/v1/leads/${encodeURIComponent(leadId)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (!res.ok) {
        const detalhe = await res.json().catch(() => null);
        setErro(detalhe?.error?.message ?? "Não foi possível salvar a resposta.");
      } else {
        setSalvo(true);
        setValor("");
        setAte("");
        aoSalvar();
      }
    } catch {
      setErro("Falha de rede ao salvar a resposta.");
    }
    setSalvando(false);
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <input
        value={valor}
        onChange={(e) => {
          setValor(e.target.value);
          setSalvo(false);
        }}
        placeholder={chave === "faixaDePreco" ? `de ${campo.dica}` : campo.dica}
        aria-label={campo.rotulo}
        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[.04] px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500"
      />
      {chave === "faixaDePreco" ? (
        <input
          value={ate}
          onChange={(e) => {
            setAte(e.target.value);
            setSalvo(false);
          }}
          placeholder="até 500000"
          aria-label="Limite superior da faixa de valor"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[.04] px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500"
        />
      ) : null}
      <button
        type="button"
        onClick={() => void salvar()}
        disabled={!corpo || salvando}
        className="rounded-lg bg-amber-400/20 px-3 py-1.5 text-xs font-semibold text-amber-100 disabled:opacity-40"
      >
        {salvando ? "Salvando…" : "Registrar resposta"}
      </button>
      {salvo ? <span className="text-xs text-emerald-300">gravado</span> : null}
      {erro ? <span className="text-xs text-rose-300">{erro}</span> : null}
    </div>
  );
}
