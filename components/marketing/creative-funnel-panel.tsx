"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { comPresencaDeIa } from "@/lib/ai/presence";

/**
 * FUNIL REAL DE CADA CRIATIVO — o painel da agência.
 *
 * A Meta mostra CTR e custo por clique. Este painel mostra o que acontece
 * DEPOIS do clique: quantas leads a peça trouxe, quantas foram atendidas,
 * quantas visitaram, quantas compraram. É a metade que decide criativo, e a
 * única que não depende de `ads_read`.
 *
 * ── A COLUNA MAIS IMPORTANTE É A DE ANÚNCIOS ÓRFÃOS ─────────────────────────
 *
 * Peça no ar trazendo lead sem estar registrada no Atlas é medição que se
 * perde todo dia. A base tem uma agora — 21 leads de um anúncio que ninguém
 * cadastrou. Vincular é um campo; sem ele, nada do resto existe.
 */

type Linha = {
  versionId: string;
  nome: string;
  adId: string | null;
  empreendimento: string | null;
  formato: string;
  angulo: string;
  revisao: string;
  leads: number;
  contatadas: number;
  visitas: number;
  propostas: number;
  vendas: number;
  taxaDeAtendimento: number | null;
  taxaDeVisita: number | null;
  taxaDeVenda: number | null;
  classificacao: "ganhando" | "aprendendo" | "perdendo" | null;
  semClassificacao: string | null;
};

type Payload = {
  linhas: Linha[];
  total: { criativos: number; comAmostra: number; leads: number; leadsSemCriativo: number };
  anunciosOrfaos: Array<{ adId: string; leads: number }>;
  naoMedido: string[];
  resumo: string;
};

const SINAL: Record<string, { emoji: string; rotulo: string }> = {
  ganhando: { emoji: "🟢", rotulo: "acima da mediana" },
  aprendendo: { emoji: "🟡", rotulo: "na mediana" },
  perdendo: { emoji: "🔴", rotulo: "abaixo da mediana" },
};

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

export function CreativeFunnelPanel() {
  const [dados, setDados] = useState<Payload | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [vinculando, setVinculando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const encerrar = () => {};
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const r = await comPresencaDeIa("Medindo o funil de cada criativo", () =>
        fetch("/api/v1/marketing/creative-funnel", {
          headers: { Authorization: `Bearer ${sessao.session?.access_token || ""}` },
          cache: "no-store",
        }),
      );
      const corpo = await r.json();
      if (r.ok) setDados(corpo.data);
      else setErro(corpo?.error?.message || "Não foi possível medir os criativos.");
    } catch {
      setErro("Falha de rede ao medir os criativos.");
    } finally {
      encerrar();
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  async function vincular(versionId: string, adId: string) {
    setVinculando(versionId);
    setAviso(null);
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const r = await fetch("/api/v1/marketing/creative-funnel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessao.session?.access_token || ""}` },
        body: JSON.stringify({ versionId, adId, plataforma: "meta" }),
      });
      const corpo = await r.json();
      setAviso(r.ok ? "✓ anúncio vinculado — o funil já conta com ele" : (corpo?.error?.message || "Não foi possível vincular."));
      if (r.ok) await carregar();
    } finally {
      setVinculando(null);
    }
  }

  if (carregando && !dados) {
    return <p className="atlas-criativo-vazio">Medindo o funil de cada peça…</p>;
  }
  if (erro) return <p className="atlas-criativo-erro">{erro}</p>;
  if (!dados) return null;

  return (
    <div className="atlas-criativo">
      <p className="atlas-criativo-resumo">{dados.resumo}</p>

      {/* Os órfãos vêm PRIMEIRO. Peça no ar sem registro é medição perdida todo
          dia, e é a única coisa aqui que exige ação imediata. */}
      {dados.anunciosOrfaos.length ? (
        <section className="atlas-criativo-orfaos">
          <p>
            ⚠️ <strong>{dados.anunciosOrfaos.length} anúncio(s) trazendo lead sem criativo cadastrado.</strong>{" "}
            Enquanto não forem vinculados, o desempenho deles não é medido.
          </p>
          <ul>
            {dados.anunciosOrfaos.map((a) => (
              <li key={a.adId}>
                <code>{a.adId}</code>
                <span>{a.leads} lead(s)</span>
                {dados.linhas.filter((l) => !l.adId).length ? (
                  <select
                    aria-label={`Vincular o anúncio ${a.adId} a um criativo`}
                    defaultValue=""
                    disabled={Boolean(vinculando)}
                    onChange={(e) => { if (e.target.value) void vincular(e.target.value, a.adId); }}
                  >
                    <option value="">vincular a um criativo…</option>
                    {dados.linhas.filter((l) => !l.adId).map((l) => (
                      <option key={l.versionId} value={l.versionId}>{l.nome}</option>
                    ))}
                  </select>
                ) : (
                  <span className="atlas-criativo-dica">cadastre o criativo primeiro, depois vincule</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {dados.linhas.length ? (
        <div className="atlas-criativo-tabela-wrap">
          <table className="atlas-criativo-tabela">
            <thead>
              <tr>
                <th scope="col">Peça</th>
                <th scope="col">Leads</th>
                <th scope="col">Atendidas</th>
                <th scope="col">Visitas</th>
                <th scope="col">Propostas</th>
                <th scope="col">Vendas</th>
              </tr>
            </thead>
            <tbody>
              {dados.linhas.map((l) => {
                const sinal = l.classificacao ? SINAL[l.classificacao] : null;
                return (
                  <tr key={l.versionId}>
                    <th scope="row">
                      <span title={sinal?.rotulo ?? l.semClassificacao ?? ""}>
                        {sinal?.emoji ?? "⚪"}
                      </span>{" "}
                      {l.nome}
                      <span className="atlas-criativo-meta">
                        {[l.empreendimento, l.formato, l.angulo].filter(Boolean).join(" · ")}
                        {l.adId ? "" : " · sem anúncio vinculado"}
                      </span>
                      {/* A razão de não haver classificação fica na linha, não
                          num rodapé: quem lê a linha é quem precisa saber. */}
                      {l.semClassificacao ? (
                        <span className="atlas-criativo-nota">{l.semClassificacao}</span>
                      ) : null}
                    </th>
                    <td className="cc23-num">{l.leads}</td>
                    <td className="cc23-num">
                      {l.contatadas}
                      {l.taxaDeAtendimento !== null ? <span> ({pct(l.taxaDeAtendimento)})</span> : null}
                    </td>
                    <td className="cc23-num">{l.visitas}</td>
                    <td className="cc23-num">{l.propostas}</td>
                    <td className="cc23-num">
                      {l.vendas}
                      {l.taxaDeVenda !== null && l.vendas > 0 ? <span> ({pct(l.taxaDeVenda)})</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="atlas-criativo-vazio">
          Nenhum criativo cadastrado ainda. Cadastre a peça com o brief e vincule
          o anúncio — a partir daí o funil dela é medido sozinho.
        </p>
      )}

      {dados.naoMedido.length ? (
        <div className="atlas-criativo-ressalva">
          <p>O que esta conta não alcança</p>
          {dados.naoMedido.map((m) => <p key={m}>{m}</p>)}
        </div>
      ) : null}

      {aviso ? <p className="atlas-criativo-aviso">{aviso}</p> : null}

      <p className="atlas-criativo-rodape">
        Medido sobre as leads do CRM — não depende da permissão de leitura da conta
        de anúncios. Correlação, não causa: uma peça pode converter mais por estar
        num público melhor ou num empreendimento mais barato.
      </p>
    </div>
  );
}

export default CreativeFunnelPanel;
