"use client";

import { useCallback, useEffect, useState } from "react";
import { AtlasEmpty, AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { StatusBadge } from "@/components/atlas/status-badge";
import { supabase } from "@/lib/supabase";

/**
 * QUEM RECEBE AS LEADS DE CADA FORMULÁRIO.
 *
 * ── Por que esta tela existe ────────────────────────────────────────────────
 *
 * `meta_lead_sources.default_owner_id` aceita UM dono, e ele é o degrau 1 da
 * cascata — passa na frente do elenco por empreendimento e da fila de
 * atendimento. Medido no banco vivo em 03/08/2026: OITO formulários ativos
 * apontando para o mesmo perfil, que sozinho segura 485 das 613 leads da base.
 *
 * O motor já sabe rodiziar por formulário e a tabela existe. Faltava por onde
 * configurar — e recurso ligado sem tela é a mesma classe de defeito que esta
 * entrega perseguiu quatro vezes, só que criada por quem consertou as outras.
 *
 * ── A FRASE QUE ESTA TELA NUNCA DEIXA DE DIZER ─────────────────────────────
 *
 * Rodízio vazio NÃO significa "nada configurado". Significa "tudo vai para o
 * dono único" — que é o oposto, e é a informação que faz alguém agir. Por isso
 * o dono único aparece na linha, com destaque, quando não há rodízio.
 */

type Membro = { profileId: string; nome: string; posicao: number };
type Fonte = {
  id: string; nome: string; leads: number;
  donoUnicoId: string | null; donoUnicoNome: string | null;
  membros: Membro[]; rodizioAtivo: boolean;
};
type Resposta = {
  fontes: Fonte[];
  corretores: Array<{ id: string; nome: string }>;
  fontesComDonoUnico: number;
};

export function RodizioPorFontePanel({ podeEditar = true }: { podeEditar?: boolean }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [semLead, setSemLead] = useState(false);

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const resposta = await fetch("/api/v1/crm/rodizio-por-fonte", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      const corpo = await resposta.json();
      if (!resposta.ok || !corpo?.ok) {
        setErro(corpo?.error?.message || "Não foi possível ler o rodízio por formulário.");
        return;
      }
      setDados(corpo.data as Resposta);
      setErro(null);
    } catch {
      setErro("Não foi possível falar com o servidor. A lista NÃO está vazia — ela não pôde ser lida.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  async function alternar(fonteId: string, profileId: string, entrar: boolean) {
    if (!podeEditar) return;
    setGravando(`${fonteId}:${profileId}`);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const resposta = await fetch("/api/v1/crm/rodizio-por-fonte", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ fonteId, profileId, ativo: entrar }),
      });
      const corpo = await resposta.json();
      if (!resposta.ok || !corpo?.ok) {
        setErro(corpo?.error?.message || "Não foi possível gravar o rodízio.");
        return;
      }
      setErro(null);
      await carregar(true);
    } finally {
      setGravando(null);
    }
  }

  const fontes = dados?.fontes ?? [];
  // Formulário sem lead nenhuma é ruído: são 17 na base e a maioria nunca
  // trouxe ninguém. Fica atrás de um botão, como as campanhas sem volume.
  const visiveis = semLead ? fontes : fontes.filter((f) => f.leads > 0);
  const escondidas = fontes.length - fontes.filter((f) => f.leads > 0).length;

  return (
    <div className="cc6-panel overflow-hidden">
      <header className="px-5 pt-4 pb-2.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <h2 className="text-base font-semibold tracking-tight text-[var(--atlas-texto-forte)]">
            Quem recebe cada formulário
          </h2>
          <p className="cc6-eyebrow text-micro!">Rodízio por fonte · decide antes da fila</p>
        </div>
        <p className="mt-1 text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
          O formulário decide <strong className="text-[var(--atlas-texto-medio)]">antes</strong> do empreendimento:
          com dono único, toda lead dele vai para uma pessoa e a fila de atendimento nem é consultada.
          Com rodízio, a vez é de quem tem menos leads <em>daquele formulário</em>.
        </p>
      </header>

      {erro ? (
        <div className="px-5 pb-3">
          <AtlasRecoverableError description={erro} onRetry={() => void carregar()} busy={carregando} />
        </div>
      ) : null}

      {/* O número que resume o risco. Rodízio vazio lê-se como "nada
          configurado"; a verdade é "tudo numa pessoa só". */}
      {dados && dados.fontesComDonoUnico > 0 ? (
        <div className="cc6-hairline cc6-sev-band px-5 py-3" style={{ "--cc6-sev": "var(--atlas-estado-atencao)" } as React.CSSProperties}>
          <p className="text-corpo leading-5 text-[var(--atlas-texto-forte)]">
            <span className="cc6-num cc6-warn font-semibold">{dados.fontesComDonoUnico}</span>{" "}
            {dados.fontesComDonoUnico === 1 ? "formulário entrega" : "formulários entregam"} tudo para uma pessoa só.
            Enquanto for assim, o elenco por empreendimento e a fila de atendimento não decidem nada para essas leads.
          </p>
        </div>
      ) : null}

      {carregando && !dados ? (
        <div className="space-y-2 p-5" aria-busy="true">
          {[1, 2, 3].map((i) => <AtlasSkeleton key={i} className="h-14" />)}
        </div>
      ) : visiveis.length === 0 ? (
        <div className="cc6-hairline px-5 py-4">
          <AtlasEmpty
            reason="no-results"
            eyebrow="Nenhum formulário com lead"
            title="Nenhum formulário trouxe lead ainda"
            description="Formulários sem volume ficam ocultos — use o botão abaixo para vê-los."
          />
        </div>
      ) : (
        <ul>
          {visiveis.map((fonte) => {
            const expandida = aberta === fonte.id;
            const naRodada = new Set(fonte.membros.map((m) => m.profileId));
            return (
              <li key={fonte.id} className="cc6-hairline px-5 py-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  {/* SEM `truncate`: nome de formulário da Meta é comprido por
                      natureza, e cortado não identifica formulário nenhum. */}
                  <h3 className="min-w-0 flex-1 text-sm font-medium leading-5 text-[var(--atlas-texto-forte)]">
                    {fonte.nome}
                  </h3>
                  <span className="cc6-num shrink-0 text-rotulo text-[var(--atlas-texto-fraco)]">
                    {fonte.leads} {fonte.leads === 1 ? "lead" : "leads"}
                  </span>
                  {fonte.rodizioAtivo ? (
                    <StatusBadge tone="success">rodízio · {fonte.membros.length}</StatusBadge>
                  ) : fonte.donoUnicoId ? (
                    <StatusBadge tone="warning">dono único</StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">cascata</StatusBadge>
                  )}
                </div>

                <p className="mt-1 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
                  {fonte.rodizioAtivo ? (
                    <>Rodízio entre {fonte.membros.map((m) => m.nome).join(", ")}.</>
                  ) : fonte.donoUnicoNome ? (
                    <>Tudo vai para <strong className="cc6-warn">{fonte.donoUnicoNome}</strong>. Coloque alguém no rodízio para alternar.</>
                  ) : (
                    <>Sem dono único e sem rodízio: a lead segue para a cascata normal (elenco, fila, gerente).</>
                  )}
                </p>

                {podeEditar ? (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => setAberta(expandida ? null : fonte.id)}
                      aria-expanded={expandida}
                      className="cc6-chip cc6-interativo cursor-pointer"
                    >
                      {expandida ? "fechar" : "quem entra no rodízio"}
                    </button>
                    {expandida ? (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {(dados?.corretores ?? []).map((corretor) => {
                          const dentro = naRodada.has(corretor.id);
                          const chave = `${fonte.id}:${corretor.id}`;
                          return (
                            <button
                              key={corretor.id}
                              type="button"
                              disabled={gravando !== null}
                              onClick={() => void alternar(fonte.id, corretor.id, !dentro)}
                              aria-pressed={dentro}
                              className={`cc6-chip cc6-interativo max-w-full cursor-pointer whitespace-normal! disabled:opacity-50 ${dentro ? "border-[color:var(--atlas-accent)]! text-[var(--atlas-texto-forte)]!" : ""}`}
                            >
                              {gravando === chave ? "gravando…" : <>{dentro ? "✓ " : "+ "}{corretor.nome}</>}
                            </button>
                          );
                        })}
                        {/* Vazio pelo componente compartilhado, e não por um
                            <p> solto: é ele que carrega o motivo taxonômico
                            (`data-empty-reason`) que a tela de navegação usa
                            para distinguir "não há" de "não configurado". Um
                            parágrafo bonito diz a mesma frase e não diz nada
                            para quem mede. */}
                        {(dados?.corretores ?? []).length === 0 ? (
                          <AtlasEmpty
                            reason="not-configured"
                            eyebrow="Equipe sem corretor"
                            title="Nenhum corretor ativo"
                            description="Sem corretor ativo na organização não há quem colocar no rodízio deste formulário."
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {escondidas > 0 ? (
        <div className="cc6-hairline px-5 py-2.5">
          <button type="button" onClick={() => setSemLead((v) => !v)} className="cc6-chip cc6-interativo cursor-pointer">
            {semLead ? "ocultar formulários sem lead" : `mostrar ${escondidas} sem lead nenhuma`}
          </button>
        </div>
      ) : null}

      <p className="cc6-hairline px-5 py-2.5 text-micro leading-4 text-[var(--atlas-texto-fraco)]">
        Quem entra vai para o fim da ordem · a vez sai de quem tem menos leads deste formulário, nunca de um ponteiro guardado ·
        membro sem WhatsApp conectado é pulado, com o motivo no histórico.
      </p>
    </div>
  );
}
